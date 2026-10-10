import { azure, isInProgress, type ArmId, type Resource, type ServiceState, type World } from '../../engine/index.ts'
import type { WatchedFlow } from '../../store/gameStore.ts'
import { typeLabel } from '../resourceKinds.ts'

/**
 * Everything the architecture canvas draws, derived from the world on every call
 * (`.claude/skills/visual-infrastructure`). Pure: no React, no React Flow. The canvas owns only
 * which layer is shown and which flows are watched.
 *
 * - Nesting comes from ARM IDs and references: resource group → VNet → subnet → compute unit.
 * - Association lines come from `azure.dependenciesOf` (CLAUDE.md rule 6).
 * - Traffic lines come only from `azure.ipFlowVerify` / `evaluateFlow` (rule 5).
 * - Positions come from a deterministic auto-layout (D-5): the same world always draws the same way.
 */

export type Tone = 'ok' | 'progress' | 'warn' | 'bad' | 'muted' | 'neutral'
/** Every status has text as well as a tone, so colour is never the only signal. */
export interface Status {
  tone: Tone
  text: string
  /** Longer explanation, shown on hover (e.g. why an app is degraded). */
  detail?: string
}

/** A small, selectable label on a unit: its public IP, NIC or NIC-level NSG. */
export interface Chip {
  resourceId: ArmId
  kind: 'publicIp' | 'networkInterface' | 'networkSecurityGroup'
  label: string
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** A box that contains other things: a resource group, a VNet or a subnet. */
export interface CanvasBox extends Rect {
  id: string
  kind: 'resourceGroup' | 'virtualNetwork' | 'subnet'
  resourceId: ArmId
  title: string
  detail: string
  status: Status
  chips: Chip[]
}

/** Something drawn as a card: the Internet, a compute unit (VM + NIC) or another resource. */
export interface CanvasNode extends Rect {
  id: string
  kind: 'internet' | 'compute' | 'resource'
  resourceId: ArmId | null
  resourceType: string | null
  title: string
  typeLabel: string
  facts: string[]
  status: Status
  chips: Chip[]
}

export type Verdict = 'allowed' | 'denied' | 'not-modelled' | 'unavailable'

export interface CanvasEdge {
  id: string
  kind: 'association' | 'traffic'
  source: string
  target: string
  label: string
  dependency?: azure.DependencyKind
  flowId?: string
  verdict?: Verdict
  reason?: string
  /** Short verdict text for the line's label: "Allowed", "Denied by <rule>", "Not modelled", "Unavailable". */
  summary?: string
  /** What the connection is for, when a mission declares it. */
  title?: string
}

export interface CanvasGraph {
  boxes: CanvasBox[]
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export const INTERNET_ID = 'internet'

// ── Layout constants (px) ──────────────────────────────────────────────────────────────────────

const INTERNET = { x: 0, y: 64, width: 170, height: 100 }
const LEFT = 240
const RG_GAP = 36
const RG_HEADER = 46
const RG_PAD = 18
const VNET_HEADER = 46
const VNET_PAD = 16
const VNET_GAP = 20
const SUBNET_HEADER = 42
const SUBNET_PAD = 14
const SUBNET_GAP = 14
const SUBNET_EMPTY = 40
const UNIT = { width: 240, height: 148 }
const UNIT_GAP = 14
const UNITS_PER_ROW = 2
const SIDE = { width: 230, height: 100 }
const SIDE_GAP = 14
const SIDE_OFFSET = 28

// ── Status ─────────────────────────────────────────────────────────────────────────────────────

const POWER_TEXT: Record<string, string> = {
  creating: 'Creating…', starting: 'Starting', running: 'Running', stopping: 'Stopping', stopped: 'Stopped',
  deallocating: 'Deallocating', deallocated: 'Deallocated',
}

/** Status from provisioning (ARM-1s) and, for VMs, power state (VM-7). */
export function resourceStatus(world: World, r: Resource): Status {
  if (isInProgress(r.provisioningState)) return { tone: 'progress', text: `${r.provisioningState}…` }
  if (r.provisioningState === 'Failed') return { tone: 'bad', text: 'Failed' }
  if (r.type.toLowerCase() === azure.VM_TYPE.toLowerCase()) {
    const power = azure.powerStateOf(world, r.id)
    if (!power) return { tone: 'neutral', text: 'Power state unknown' }
    const text = POWER_TEXT[power] ?? power
    if (power === 'running') return { tone: 'ok', text }
    if (power === 'creating' || power === 'starting' || power === 'stopping' || power === 'deallocating') return { tone: 'progress', text }
    return { tone: 'muted', text }
  }
  return { tone: 'ok', text: 'Succeeded' }
}

/** The more urgent of two statuses (in progress or failed wins over fine). */
function worst(a: Status, b: Status): Status {
  const rank: Record<Tone, number> = { bad: 5, warn: 4, progress: 3, muted: 2, neutral: 1, ok: 0 }
  return rank[b.tone] > rank[a.tone] ? b : a
}

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────

const key = azure.armKey
const isType = (r: Resource, type: string) => r.type.toLowerCase() === type.toLowerCase()
const byName = (a: Resource, b: Resource) => a.name.localeCompare(b.name)
const inGroup = (r: Resource, subscriptionId: string, rgName: string) => {
  const p = azure.parseArmId(r.id)
  return !!p && p.subscriptionId === subscriptionId && azure.sameName(p.resourceGroupName ?? '', rgName)
}
const topLevel = (r: Resource) => (azure.parseArmId(r.id)?.names.length ?? 0) === 1

const primaryNicOf = (world: World, vm: Resource): Resource | undefined => {
  const refs = azure.networkInterfacesOf(vm)
  const ref = refs.find(n => n.properties.primary) ?? refs[0]
  return ref ? azure.getResource(world, ref.id) : undefined
}

/** The VM a NIC is attached to (VM-16s), if any. */
function vmOfNic(world: World, nic: Resource): Resource | undefined {
  return azure.resourcesOfType(world, azure.VM_TYPE).find(vm => azure.networkInterfacesOf(vm).some(n => azure.sameName(n.id, nic.id)))
}

const privateIpOf = (nic: Resource) => azure.ipConfigurationsOf(nic)[0]?.properties.privateIPAddress ?? ''
const subnetIdOf = (nic: Resource) => azure.ipConfigurationsOf(nic)[0]?.properties.subnet.id
const publicIpIdOf = (nic: Resource) => azure.ipConfigurationsOf(nic)[0]?.properties.publicIPAddress?.id

// ── Compute units: a VM drawn through its NIC (D-5), or a NIC on its own ─────────────────────────

const APP_LABEL = { 'game-api': 'Game API', postgres: 'PostgreSQL' } as const
const SERVICE_STATUS: Record<ServiceState['status'], (s: ServiceState) => Status> = {
  up: s => ({ tone: 'ok', text: `${APP_LABEL[s.kind]} up`, detail: s.reason }),
  degraded: s => ({ tone: 'warn', text: `${APP_LABEL[s.kind]} degraded`, detail: s.reason }),
  down: s => ({ tone: 'bad', text: `${APP_LABEL[s.kind]} down`, detail: s.reason }),
}

function computeUnit(world: World, nic: Resource): Omit<CanvasNode, keyof Rect> {
  const vm = vmOfNic(world, nic)
  const chips: Chip[] = [{ resourceId: nic.id, kind: 'networkInterface', label: `${nic.name} · ${privateIpOf(nic)}` }]
  const pipId = publicIpIdOf(nic)
  const pip = pipId ? azure.getResource(world, pipId) : undefined
  if (pip) chips.push({ resourceId: pip.id, kind: 'publicIp', label: `${pip.name} · ${String(pip.properties.ipAddress ?? '')}` })
  const nsgId = azure.nicNsgId(nic)
  const nsg = nsgId ? azure.getResource(world, nsgId) : undefined
  if (nsg) chips.push({ resourceId: nsg.id, kind: 'networkSecurityGroup', label: `NSG ${nsg.name}` })

  if (vm) {
    const size = (vm.properties.hardwareProfile as { vmSize?: string } | undefined)?.vmSize ?? ''
    let status = worst(resourceStatus(world, vm), resourceStatus(world, nic))
    const service = world.runtime[key(vm.id)]?.service
    // A running VM's card shows its app's health (RUN-2s); a VM that isn't running shows its power state.
    if (service && status.tone === 'ok') status = SERVICE_STATUS[service.status](service)
    return {
      id: key(nic.id), kind: 'compute', resourceId: vm.id, resourceType: vm.type, title: vm.name,
      typeLabel: typeLabel(vm.type), facts: [size], status, chips,
    }
  }
  return {
    id: key(nic.id), kind: 'compute', resourceId: nic.id, resourceType: nic.type, title: nic.name,
    typeLabel: typeLabel(nic.type), facts: ['Not attached to a VM'], status: resourceStatus(world, nic), chips: chips.slice(1),
  }
}

function sideNode(world: World, r: Resource): Omit<CanvasNode, keyof Rect> {
  const facts: string[] = []
  if (isType(r, azure.NSG_TYPE)) facts.push(`${azure.securityRulesOf(world, r.id).length} custom rules`)
  if (isType(r, azure.PUBLIC_IP_TYPE)) facts.push(String(r.properties.ipAddress ?? ''), 'Not associated')
  if (isType(r, azure.DISK_TYPE)) facts.push(r.sku?.name ?? '')
  if (isType(r, azure.NIC_TYPE)) facts.push(privateIpOf(r))
  return {
    id: key(r.id), kind: 'resource', resourceId: r.id, resourceType: r.type, title: r.name, typeLabel: typeLabel(r.type),
    facts: facts.filter(Boolean), status: resourceStatus(world, r), chips: [],
  }
}

// ── Traffic: watched flows, verdicts only from the flow evaluator ───────────────────────────────

export interface FlowCheck {
  vmName: string
  direction: 'Inbound' | 'Outbound'
  result: azure.IpFlowVerifyResult
}

export interface FlowEvaluation {
  /** Canvas element IDs of the two ends, in the direction traffic travels. */
  source: string
  target: string
  verdict: Verdict
  reason: string
  /** Short form of the verdict for labels. */
  summary: string
  label: string
  /** Every check made, sender first (outbound), then receiver (inbound). */
  checks: FlowCheck[]
}

/**
 * Evaluate a watched flow with IP flow verify (NW-1) for the watched VM and, when the other end is a VM
 * in the same tenant, for that VM too: traffic between two VMs needs the sender's outbound and the
 * receiver's inbound rules to allow it (NSG-7). Null when the VM or its NIC no longer exists.
 */
export function evaluateWatchedFlow(world: World, flow: WatchedFlow): FlowEvaluation | null {
  const vm = azure.getResource(world, flow.vmId)
  const nic = vm ? primaryNicOf(world, vm) : undefined
  if (!vm || !nic) return null
  const localIp = privateIpOf(nic)
  const vnetOf = (n: Resource) => azure.parentResourceId(subnetIdOf(n) ?? '')?.toLowerCase()
  const remoteNic = azure.resourcesOfType(world, azure.NIC_TYPE)
    .find(n => privateIpOf(n) === flow.remoteIp && vnetOf(n) === vnetOf(nic) && !azure.sameName(n.id, nic.id))
  const remoteVm = remoteNic ? vmOfNic(world, remoteNic) : undefined
  const localEnd = key(nic.id)
  const remoteEnd = remoteNic ? key(remoteNic.id) : INTERNET_ID

  const here: FlowCheck = {
    vmName: vm.name, direction: flow.direction,
    result: azure.ipFlowVerify(world, {
      vmId: vm.id, direction: flow.direction, protocol: flow.protocol, localIp, localPort: flow.localPort,
      remoteIp: flow.remoteIp, remotePort: flow.remotePort,
    }),
  }
  const checks: FlowCheck[] = [here]
  if (remoteVm) {
    const opposite = flow.direction === 'Inbound' ? 'Outbound' : 'Inbound'
    const there: FlowCheck = {
      vmName: remoteVm.name, direction: opposite,
      result: azure.ipFlowVerify(world, {
        vmId: remoteVm.id, direction: opposite, protocol: flow.protocol, localIp: flow.remoteIp, localPort: flow.remotePort,
        remoteIp: localIp, remotePort: flow.localPort,
      }),
    }
    // Sender first: for an inbound flow the remote VM sends.
    if (flow.direction === 'Inbound') checks.unshift(there)
    else checks.push(there)
  }

  const servicePort = flow.direction === 'Inbound' ? flow.localPort : flow.remotePort
  const label = `${flow.protocol.toUpperCase()} ${servicePort}`
  const [source, target] = flow.direction === 'Inbound' ? [remoteEnd, localEnd] : [localEnd, remoteEnd]

  for (const c of checks) {
    if (!c.result.ok) {
      const r = c.result.refusal
      if (r.kind === 'not-modelled') return { source, target, label, checks, verdict: 'not-modelled', summary: 'Not modelled', reason: `${r.message} (${r.ruleId})` }
      return { source, target, label, checks, verdict: 'unavailable', summary: 'Unavailable', reason: r.message }
    }
  }
  for (const c of checks) {
    if (c.result.ok && c.result.access === 'Access denied') {
      const where = c.result.nsgName ? ` in ${c.result.nsgName}` : ''
      const why = c.result.ruleName ? `Denied by ${c.result.ruleName}${where}` : `Denied: no network security group allows traffic to ${c.vmName} (NSG-8)`
      const summary = c.result.ruleName ? `Denied by ${c.result.ruleName}` : 'Denied'
      return { source, target, label, checks, verdict: 'denied', summary, reason: `${why} (${c.direction.toLowerCase()} at ${c.vmName})` }
    }
  }
  const last = checks.at(-1)?.result
  const allowedBy = last?.ok && last.ruleName ? ` by ${last.ruleName}` : ''
  return { source, target, label, checks, verdict: 'allowed', summary: 'Allowed', reason: `Allowed${allowedBy}` }
}

// ── The graph ──────────────────────────────────────────────────────────────────────────────────

export function buildCanvasGraph(world: World, watched: readonly WatchedFlow[]): CanvasGraph {
  const boxes: CanvasBox[] = []
  const nodes: CanvasNode[] = []
  const edges: CanvasEdge[] = []
  const resources = Object.values(world.tenant.resources)
  const nics = resources.filter(r => isType(r, azure.NIC_TYPE))
  const drawnInSubnet = new Set<string>()
  const attachedPips = new Set(nics.map(publicIpIdOf).filter((x): x is string => !!x).map(key))

  nodes.push({
    ...INTERNET, id: INTERNET_ID, kind: 'internet', resourceId: null, resourceType: null, title: 'Internet',
    typeLabel: 'Outside Azure', facts: ['Players and the office connect from here'], status: { tone: 'neutral', text: '' }, chips: [],
  })

  const groups = Object.values(world.tenant.resourceGroups).sort((a, b) => a.name.localeCompare(b.name))
  let y = 0
  for (const group of groups) {
    const parsed = azure.parseArmId(group.id)
    const subscriptionId = parsed?.subscriptionId ?? ''
    const innerX = LEFT + RG_PAD
    let cy = y + RG_HEADER
    let vnetWidth = 0

    const vnets = resources.filter(r => isType(r, azure.VNET_TYPE) && inGroup(r, subscriptionId, group.name)).sort(byName)
    for (const vnet of vnets) {
      const vnetY = cy
      let sy = vnetY + VNET_HEADER
      const subnetWidth = 2 * SUBNET_PAD + UNITS_PER_ROW * UNIT.width + (UNITS_PER_ROW - 1) * UNIT_GAP
      const subnets = azure.childResources(world, vnet.id, azure.SUBNET_TYPE).sort(byName)
      for (const subnet of subnets) {
        const units = nics.filter(n => azure.sameName(subnetIdOf(n) ?? '', subnet.id))
          .map(n => computeUnit(world, n)).sort((a, b) => a.title.localeCompare(b.title))
        const rows = Math.ceil(units.length / UNITS_PER_ROW)
        const height = SUBNET_HEADER + (rows === 0 ? SUBNET_EMPTY : rows * UNIT.height + (rows - 1) * UNIT_GAP) + SUBNET_PAD
        const nsgId = azure.dependenciesOf(world, subnet.id).find(d => d.kind === 'networkSecurityGroup')?.to
        const nsg = nsgId ? azure.getResource(world, nsgId) : undefined
        boxes.push({
          id: key(subnet.id), kind: 'subnet', resourceId: subnet.id, title: subnet.name, detail: String(subnet.properties.addressPrefix ?? ''),
          x: innerX + VNET_PAD, y: sy, width: subnetWidth, height, status: resourceStatus(world, subnet),
          chips: nsg ? [{ resourceId: nsg.id, kind: 'networkSecurityGroup', label: `NSG ${nsg.name}` }] : [],
        })
        units.forEach((u, i) => {
          const col = i % UNITS_PER_ROW
          const row = Math.floor(i / UNITS_PER_ROW)
          nodes.push({
            ...u, ...UNIT,
            x: innerX + VNET_PAD + SUBNET_PAD + col * (UNIT.width + UNIT_GAP),
            y: sy + SUBNET_HEADER + row * (UNIT.height + UNIT_GAP),
          })
          drawnInSubnet.add(u.id)
        })
        sy += height + SUBNET_GAP
      }
      const width = subnetWidth + 2 * VNET_PAD
      const height = Math.max(sy - vnetY - SUBNET_GAP, VNET_HEADER) + VNET_PAD
      boxes.push({
        id: key(vnet.id), kind: 'virtualNetwork', resourceId: vnet.id, title: vnet.name,
        detail: `${azure.addressPrefixesOf(vnet).join(', ')} · ${azure.regionDisplayName(vnet.location)}`,
        x: innerX, y: vnetY, width, height, status: resourceStatus(world, vnet), chips: [],
      })
      vnetWidth = Math.max(vnetWidth, width)
      cy = vnetY + height + VNET_GAP
    }
    const vnetsBottom = vnets.length ? cy - VNET_GAP : y + RG_HEADER

    // Everything else in the group: NSGs, unattached public IPs, disks, NICs outside any drawn subnet,
    // and VMs whose NIC isn't drawn in a subnet.
    const side = resources.filter(r => inGroup(r, subscriptionId, group.name) && topLevel(r))
      .filter(r => !isType(r, azure.VNET_TYPE))
      .filter(r => !(isType(r, azure.NIC_TYPE) && drawnInSubnet.has(key(r.id))))
      .filter(r => !(isType(r, azure.PUBLIC_IP_TYPE) && attachedPips.has(key(r.id))))
      .filter(r => {
        if (!isType(r, azure.VM_TYPE)) return true
        const nic = primaryNicOf(world, r)
        return !(nic && drawnInSubnet.has(key(nic.id)))
      })
      .sort((a, b) => a.type.localeCompare(b.type) || byName(a, b))
    const sideX = vnets.length ? innerX + vnetWidth + SIDE_OFFSET : innerX
    side.forEach((r, i) => nodes.push({ ...sideNode(world, r), ...SIDE, x: sideX, y: y + RG_HEADER + i * (SIDE.height + SIDE_GAP) }))
    const sideCount = side.length
    const sideBottom = y + RG_HEADER + (sideCount ? sideCount * (SIDE.height + SIDE_GAP) - SIDE_GAP : 0)
    const right = Math.max(vnets.length ? innerX + vnetWidth : innerX, sideCount ? sideX + SIDE.width : innerX + 280)
    const height = Math.max(vnetsBottom, sideBottom, y + RG_HEADER + 40) - y + RG_PAD
    boxes.push({
      id: key(group.id), kind: 'resourceGroup', resourceId: group.id, title: group.name,
      // RG-1: a resource group's location is where its metadata lives, not a region box.
      detail: `Resource group · metadata in ${azure.regionDisplayName(group.location)}`,
      x: LEFT, y, width: right - LEFT + RG_PAD, height, status: { tone: 'ok', text: 'Succeeded' }, chips: [],
    })
    y += height + RG_GAP
  }

  // Association lines (derived, rule 6). Nesting and chips already show parent, subnet, NIC and public IP links.
  const unitOf = (id: string): string | null => {
    const r = azure.getResource(world, id)
    if (!r) return null
    if (isType(r, azure.VM_TYPE)) {
      const nic = primaryNicOf(world, r)
      return nic && drawnInSubnet.has(key(nic.id)) ? key(nic.id) : key(r.id)
    }
    return key(r.id)
  }
  const drawn = new Set([...boxes.map(b => b.id), ...nodes.map(n => n.id)])
  for (const d of azure.allDependencies(world)) {
    if (d.kind !== 'networkSecurityGroup' && d.kind !== 'osDisk') continue
    const from = unitOf(d.from)
    const to = key(d.to)
    if (!from || !drawn.has(from) || !drawn.has(to)) continue
    // Lines point from the dependency to what uses it: NSG → subnet / NIC, OS disk → VM.
    edges.push({
      id: `dep:${to}->${from}`, kind: 'association', source: to, target: from, dependency: d.kind,
      label: d.kind === 'osDisk' ? 'OS disk' : 'associated NSG',
    })
  }

  for (const flow of watched) {
    const e = evaluateWatchedFlow(world, flow)
    if (!e || !drawn.has(e.source) || !drawn.has(e.target)) continue
    edges.push({
      id: `flow:${flow.id}`, kind: 'traffic', source: e.source, target: e.target, label: e.label,
      flowId: flow.id, verdict: e.verdict, reason: e.reason, summary: e.summary, ...(flow.label ? { title: flow.label } : {}),
    })
  }

  // Containers first so they render beneath their contents.
  const order: Record<CanvasBox['kind'], number> = { resourceGroup: 0, virtualNetwork: 1, subnet: 2 }
  boxes.sort((a, b) => order[a.kind] - order[b.kind] || a.y - b.y || a.x - b.x)
  return { boxes, nodes, edges }
}
