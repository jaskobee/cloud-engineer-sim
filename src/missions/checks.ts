import { azure, isInProgress, type ArmId, type Resource, type World } from '../engine/index.ts'

/**
 * Questions missions ask the world. They look at what is exposed and how things are related, never at
 * names (CLAUDE.md rule 10), and every reachability answer comes from the flow evaluator (rule 5).
 */

/** An address on the internet that isn't the office (documentation range 198.51.100.0/24). */
export const SOME_INTERNET_IP = '198.51.100.200'
/** The client source port the checks use (made up, like the traffic model's). */
const CLIENT_PORT = 50000

const isVm = (r: Resource) => r.type.toLowerCase() === azure.VM_TYPE.toLowerCase()
export const vms = (world: World): Resource[] => Object.values(world.tenant.resources).filter(isVm)

/** VMs running a simulated app of this kind (RUN-1s). */
export const vmsRunning = (world: World, kind: 'game-api' | 'postgres'): Resource[] =>
  vms(world).filter(vm => azure.workloadOf(world, vm.id)?.kind === kind)

/** The public IP resource on a VM's primary NIC, if any. */
export function publicIpOf(world: World, vm: Resource): Resource | undefined {
  const nic = azure.primaryNicOf(world, vm)
  const ref = nic ? azure.ipConfigurationsOf(nic)[0]?.properties.publicIPAddress : undefined
  return ref ? azure.getResource(world, ref.id) : undefined
}

/** Would a new connection on `port` from `remoteIp` reach the VM's NIC? Decided by the flow evaluator. */
export function inboundAllowed(world: World, vm: Resource, protocol: azure.FlowProtocol, port: number, remoteIp: string): boolean {
  const nic = azure.primaryNicOf(world, vm)
  if (!nic) return false
  // From the internet, nothing arrives without a public IP (PIP-10s).
  const fromInternet = !vnetContains(world, nic, remoteIp)
  if (fromInternet && !publicIpOf(world, vm)) return false
  const verdict = azure.evaluateFlow(world, {
    nicId: nic.id, direction: 'Inbound', protocol, localIp: azure.privateIpOf(nic), localPort: port, remoteIp, remotePort: CLIENT_PORT,
  })
  return verdict.kind === 'decided' && verdict.access === 'Allow'
}

function vnetOf(world: World, nic: Resource): Resource | undefined {
  const subnetId = azure.ipConfigurationsOf(nic)[0]?.properties.subnet.id
  const vnetId = subnetId ? azure.parentResourceId(subnetId) : null
  return vnetId ? azure.getResource(world, vnetId) : undefined
}

function vnetContains(world: World, nic: Resource, ip: string): boolean {
  const vnet = vnetOf(world, nic)
  const address = azure.parseIPv4(ip)
  if (!vnet || address === null) return false
  return azure.addressPrefixesOf(vnet).some(p => {
    const c = azure.parseCidr(p)
    return c !== null && azure.containsAddress(c, address)
  })
}

export interface PortRange {
  protocol: azure.FlowProtocol
  from: number
  to: number
}

/** Ports where some rule's destination range starts or ends: the verdict can only change there. */
function portBoundaries(world: World): number[] {
  const starts = new Set<number>([0])
  for (const rule of azure.resourcesOfType(world, azure.SECURITY_RULE_TYPE)) {
    const range = String(rule.properties.destinationPortRange ?? '*')
    if (range === '*') continue
    const [lo, hi] = range.split('-').map(Number)
    if (lo === undefined || Number.isNaN(lo)) continue
    starts.add(lo)
    const end = (hi ?? lo) + 1
    if (end <= 65535) starts.add(end)
  }
  return [...starts].sort((a, b) => a - b)
}

/**
 * Every TCP and UDP port a new connection from `remoteIp` can reach on the VM, as ranges. Exact: the
 * flow evaluator is asked once per segment between rule boundaries.
 */
export function exposure(world: World, vm: Resource, remoteIp: string): PortRange[] {
  const starts = portBoundaries(world)
  const out: PortRange[] = []
  for (const protocol of ['Tcp', 'Udp'] as const) {
    starts.forEach((from, i) => {
      const to = (starts[i + 1] ?? 65536) - 1
      if (!inboundAllowed(world, vm, protocol, from, remoteIp)) return
      const last = out.at(-1)
      if (last && last.protocol === protocol && last.to === from - 1) last.to = to
      else out.push({ protocol, from, to })
    })
  }
  return out
}

export const formatExposure = (ranges: readonly PortRange[]): string =>
  ranges.length === 0 ? 'nothing' : ranges.map(r => `${r.protocol.toUpperCase()} ${r.from === r.to ? r.from : `${r.from}-${r.to}`}`).join(', ')

/** An address inside the VNet but outside `subnet` (another subnet, today or later). */
export function otherVnetAddress(world: World, nic: Resource, exclude: readonly string[]): string | null {
  const vnet = vnetOf(world, nic)
  if (!vnet) return null
  const excluded = exclude.map(p => azure.parseCidr(p)).filter((c): c is NonNullable<typeof c> => c !== null)
  for (const prefix of azure.addressPrefixesOf(vnet)) {
    const c = azure.parseCidr(prefix)
    if (!c) continue
    for (const candidate of [azure.lastAddress(c) - 1, c.network + 4, c.network + 260]) {
      if (candidate > c.network && candidate < azure.lastAddress(c) && !excluded.some(e => azure.containsAddress(e, candidate))) return azure.formatIPv4(candidate)
    }
  }
  return null
}

export const subnetPrefixOf = (world: World, nic: Resource): string | null => {
  const subnetId = azure.ipConfigurationsOf(nic)[0]?.properties.subnet.id
  const subnet = subnetId ? azure.getResource(world, subnetId) : undefined
  return subnet ? String(subnet.properties.addressPrefix) : null
}

// ── Monitoring ─────────────────────────────────────────────────────────────────────────────────

/** Enabled availability tests aimed at the VM's public IP over HTTPS 443, linked to an existing Application Insights. */
export function availabilityTestsFor(world: World, vm: Resource): Resource[] {
  const pip = publicIpOf(world, vm)
  if (!pip) return []
  return azure.resourcesOfType(world, azure.WEBTEST_TYPE).filter(t => {
    if (isInProgress(t.provisioningState)) return false
    const view = azure.webTestView(t)
    const url = azure.parseTestUrl(view.url)
    return view.enabled && url?.scheme === 'https' && url.port === 443 && url.host === String(pip.properties.ipAddress)
      && view.componentId !== null && azure.getResource(world, view.componentId) !== undefined
  })
}

/** Enabled availability alert rules watching a test. */
export const alertRulesFor = (world: World, test: Resource): Resource[] =>
  azure.resourcesOfType(world, azure.METRIC_ALERT_TYPE).filter(a => {
    const view = azure.metricAlertView(a)
    return view.enabled && !isInProgress(a.provisioningState) && azure.sameName(view.webTestId, test.id)
  })

/**
 * The test has been green for the last `ms`: every location reported at least once in the window and
 * every result in it passed (MON-21: Availability is the share of successful runs).
 */
export function greenFor(world: World, test: Resource, ms: number): boolean {
  const since = world.clock.now - ms
  const results = azure.resultsOf(world, test.id).filter(r => r.TimeGenerated > since)
  const locations = azure.webTestView(test).locations.map(azure.testLocationName)
  return locations.length > 0 && locations.every(l => results.some(r => r.Location === l)) && results.every(r => r.Success)
}

/** Alerts currently fired by any rule on any test of the VM. */
export const activeAlertsFor = (world: World, vm: Resource): ArmId[] =>
  availabilityTestsFor(world, vm).flatMap(t => alertRulesFor(world, t)).filter(r => azure.activeAlertOf(world, r.id)).map(r => r.id)
