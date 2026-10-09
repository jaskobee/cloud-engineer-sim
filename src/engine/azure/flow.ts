import type { Refusal } from '../commands.ts'
import type { ArmId, Resource, World } from '../world.ts'
import { armKey, parentResourceId, sameName } from './armId.ts'
import { containsAddress, parseCidr, parseIPv4, type Cidr } from './cidr.ts'
import { getResource, missing, notModelled, refId } from './common.ts'
import { ipConfigurationsOf, nicNsgId } from './networkInterfaces.ts'
import {
  DEFAULT_SECURITY_RULES, ruleProperties, securityRulesOf, type Access, type Direction, type SecurityRuleProperties,
} from './networkSecurityGroups.ts'
import { addressPrefixesOf } from './virtualNetworks.ts'
import { networkInterfacesOf, powerStateOf, VM_TYPE } from './virtualMachines.ts'

/**
 * The network flow evaluator: does an NSG allow this connection? (CLAUDE.md rule 5: the canvas,
 * IP flow verify, availability probes and mission checks all ask this one function.)
 *
 * Evaluation follows Learn: inbound passes the subnet's NSG and then the NIC's, outbound the NIC's
 * and then the subnet's (NSG-7); inbound traffic must be allowed by both. Within an NSG, rules run
 * by priority and the first match decides (NSG-1), default rules last (NSG-3). Rules see the VM's
 * private address (NSG-14). Stateful flow records (NSG-4) are kept by the traffic system (step 8).
 */

export type FlowProtocol = 'Tcp' | 'Udp'

/** A connection seen from one network interface, in IP flow verify's terms (NW-1). */
export interface NicFlow {
  nicId: ArmId
  direction: Direction
  protocol: FlowProtocol
  /** The NIC's private IP. */
  localIp: string
  localPort: number
  remoteIp: string
  remotePort: number
}

/** The rule that decided at one NSG. */
export interface StageDecision {
  association: 'Subnet' | 'NetworkInterface'
  nsgId: ArmId
  nsgName: string
  ruleName: string
  /** The rule's resource ID; null for a default rule (NSG-3). */
  ruleId: ArmId | null
  access: Access
  priority: number
}

export type FlowVerdict =
  | {
      kind: 'decided'
      access: Access
      /** Decisions in evaluation order. The last one decided the outcome. Empty when no NSG applies (NW-7s). */
      stages: StageDecision[]
      /** Why, as a rule ID from AZURE_FACTS. */
      basis: string
    }
  | { kind: 'refused'; refusal: Refusal }

const HOST_VIP = parseIPv4('168.63.129.16') as number
const PRIVATE_RANGES: Cidr[] = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10']
  .map(t => parseCidr(t))
  .filter((c): c is NonNullable<typeof c> => c !== null)

/** Where an address sits, from the point of view of a NIC's VNet (NSG-15s). */
type AddressClass = 'vnet' | 'host' | 'internet' | 'other-private'

function classify(vnetSpace: Cidr[], ip: number): AddressClass {
  if (ip === HOST_VIP) return 'host'
  if (vnetSpace.some(c => containsAddress(c, ip))) return 'vnet'
  if (PRIVATE_RANGES.some(c => containsAddress(c, ip))) return 'other-private'
  return 'internet'
}

/** true / false, or null when the answer depends on something the sim doesn't model. */
function addressMatches(prefix: string, ip: number, vnetSpace: Cidr[]): boolean | null {
  if (prefix === '*') return true
  const where = classify(vnetSpace, ip)
  switch (prefix) {
    case 'VirtualNetwork':
      if (where === 'other-private') return null
      return where === 'vnet' || where === 'host'
    case 'Internet':
      if (where === 'other-private') return null
      return where === 'internet'
    case 'AzureLoadBalancer':
      return where === 'host'
  }
  const single = parseIPv4(prefix)
  if (single !== null) return single === ip
  const block = parseCidr(prefix)
  return block ? containsAddress(block, ip) : false
}

/** A single port, a range `low-high` or `*` (single values only in the sim, NSG-11s). */
function portMatches(range: string, port: number): boolean {
  if (range === '*') return true
  const [low, high] = range.split('-').map(Number)
  if (low === undefined || Number.isNaN(low)) return false
  return port >= low && port <= (high ?? low)
}

function ruleMatches(rule: SecurityRuleProperties, flow: NicFlow, local: number, remote: number, vnetSpace: Cidr[]): boolean | null {
  if (rule.direction !== flow.direction) return false
  if (rule.protocol !== '*' && rule.protocol !== flow.protocol) return false
  const inbound = flow.direction === 'Inbound'
  const [srcIp, srcPort, dstIp, dstPort] = inbound
    ? [remote, flow.remotePort, local, flow.localPort]
    : [local, flow.localPort, remote, flow.remotePort]
  if (!portMatches(rule.sourcePortRange, srcPort) || !portMatches(rule.destinationPortRange, dstPort)) return false
  const src = addressMatches(rule.sourceAddressPrefix, srcIp, vnetSpace)
  const dst = addressMatches(rule.destinationAddressPrefix, dstIp, vnetSpace)
  if (src === false || dst === false) return false
  if (src === null || dst === null) return null
  return true
}

interface Candidate {
  name: string
  id: ArmId | null
  rule: SecurityRuleProperties
}

/**
 * Custom rules and default rules of one NSG, in processing order (NSG-1, NSG-3). A custom rule that's
 * still Creating isn't in effect yet (ARM-14s).
 */
function rulesInOrder(world: World, nsg: Resource, direction: Direction): Candidate[] {
  const custom = securityRulesOf(world, nsg.id)
    .filter(r => r.provisioningState !== 'Creating')
    .map(r => ({ name: r.name, id: r.id as ArmId | null, rule: ruleProperties(r) }))
  const defaults = ((nsg.properties.defaultSecurityRules as typeof DEFAULT_SECURITY_RULES | undefined) ?? DEFAULT_SECURITY_RULES)
    .map(d => ({ name: d.name, id: null, rule: d as SecurityRuleProperties }))
  return [...custom, ...defaults].filter(c => c.rule.direction === direction).sort((a, b) => a.rule.priority - b.rule.priority)
}

/** Evaluate a connection against the NSGs on a NIC's subnet and on the NIC itself. */
export function evaluateFlow(world: World, flow: NicFlow): FlowVerdict {
  const refuse = (refusal: Refusal): FlowVerdict => ({ kind: 'refused', refusal })
  const nic = getResource(world, flow.nicId)
  const config = nic ? ipConfigurationsOf(nic)[0] : undefined
  if (!nic || !config) return refuse(missing(`Network interface '${flow.nicId}'`))
  const local = parseIPv4(flow.localIp)
  const remote = parseIPv4(flow.remoteIp)
  if (local === null || remote === null) return refuse({ kind: 'invalid', code: 'flow/bad-address', message: 'Local and remote addresses must be IPv4 addresses.' })
  if (flow.localIp !== config.properties.privateIPAddress) {
    return refuse({ kind: 'invalid', code: 'flow/not-local', message: `${flow.localIp} isn't the private IP of '${nic.name}' (${config.properties.privateIPAddress}).` })
  }
  for (const port of [flow.localPort, flow.remotePort]) {
    if (!Number.isInteger(port) || port < 0 || port > 65535) return refuse({ kind: 'invalid', code: 'flow/bad-port', message: 'Ports are whole numbers from 0 to 65535.' })
  }

  const subnet = getResource(world, config.properties.subnet.id)
  const vnet = subnet ? getResource(world, parentResourceId(subnet.id) ?? '') : undefined
  if (!subnet || !vnet) return refuse(missing(`Subnet of '${nic.name}'`))
  const vnetSpace = addressPrefixesOf(vnet).map(t => parseCidr(t)).filter((c): c is NonNullable<typeof c> => c !== null)

  const subnetNsg = refId(subnet.properties.networkSecurityGroup)
  const nicNsg = nicNsgId(nic)
  const order: ['Subnet' | 'NetworkInterface', ArmId | null][] = flow.direction === 'Inbound'
    ? [['Subnet', subnetNsg], ['NetworkInterface', nicNsg]]
    : [['NetworkInterface', nicNsg], ['Subnet', subnetNsg]]
  const present = order.filter((o): o is ['Subnet' | 'NetworkInterface', ArmId] => o[1] !== null)

  if (present.length === 0) {
    if (flow.direction === 'Inbound' && classify(vnetSpace, remote) === 'internet') {
      return { kind: 'decided', access: 'Deny', stages: [], basis: 'NSG-8' }
    }
    return refuse(notModelled('NSG-8u', 'Neither the subnet nor the network interface has a network security group. Learn is ambiguous about this traffic, so the simulator doesn\'t model it.'))
  }

  const stages: StageDecision[] = []
  for (const [association, nsgId] of present) {
    const nsg = getResource(world, nsgId)
    if (!nsg) return refuse(missing(`Network security group '${nsgId}'`))
    let decided: StageDecision | null = null
    for (const candidate of rulesInOrder(world, nsg, flow.direction)) {
      const match = ruleMatches(candidate.rule, flow, local, remote, vnetSpace)
      if (match === null) {
        return refuse(notModelled('NSG-15s', `Rule '${candidate.name}' uses a service tag, and ${flow.remoteIp} is a private address outside this virtual network. That needs peering or a VPN, which the simulator doesn't model yet.`))
      }
      if (match) {
        decided = { association, nsgId: nsg.id, nsgName: nsg.name, ruleName: candidate.name, ruleId: candidate.id, access: candidate.rule.access, priority: candidate.rule.priority }
        break
      }
    }
    if (!decided) return refuse(notModelled('NSG-3', `No rule in '${nsg.name}' matched, which can't happen with the default rules in place.`))
    stages.push(decided)
    if (decided.access === 'Deny') return { kind: 'decided', access: 'Deny', stages, basis: 'NSG-7' }
  }
  return { kind: 'decided', access: 'Allow', stages, basis: 'NSG-7' }
}

// ── Network Watcher tools ──────────────────────────────────────────────────────────────────────

export interface IpFlowVerifyInput {
  vmId: ArmId
  direction: Direction
  protocol: FlowProtocol
  localIp: string
  localPort: number
  remoteIp: string
  remotePort: number
}

export type IpFlowVerifyResult =
  | {
      ok: true
      access: 'Access allowed' | 'Access denied'
      ruleName: string | null
      /** The NSG holding the rule. Learn: no link when a default rule decided (NW-1). */
      nsgId: ArmId | null
      nsgName: string | null
      isDefaultRule: boolean
      verdict: FlowVerdict
    }
  | { ok: false; refusal: Refusal }

/** IP flow verify (NW-1, NW-2, NW-3, NW-6s): one VM, one connection, one deciding rule. */
export function ipFlowVerify(world: World, input: IpFlowVerifyInput): IpFlowVerifyResult {
  const vm = getResource(world, input.vmId)
  if (!vm || vm.type.toLowerCase() !== VM_TYPE.toLowerCase()) return { ok: false, refusal: missing(`Virtual machine '${input.vmId}'`) }
  if (input.protocol !== 'Tcp' && input.protocol !== 'Udp') {
    return { ok: false, refusal: { kind: 'rule', ruleId: 'NW-2', message: 'IP flow verify only tests TCP and UDP.' } }
  }
  if (powerStateOf(world, vm.id) !== 'running') {
    return { ok: false, refusal: notModelled('NW-5u', `'${vm.name}' isn't running. Whether IP flow verify works then isn't documented, so the simulator doesn't model it.`) }
  }
  const nic = networkInterfacesOf(vm)
    .map(r => getResource(world, r.id))
    .find(n => n && ipConfigurationsOf(n).some(c => c.properties.privateIPAddress === input.localIp))
  if (!nic) return { ok: false, refusal: { kind: 'invalid', code: 'flow/not-local', message: `${input.localIp} isn't a private IP of '${vm.name}'.` } }

  const verdict = evaluateFlow(world, { nicId: nic.id, ...input })
  if (verdict.kind === 'refused') return { ok: false, refusal: verdict.refusal }
  const last = verdict.stages.at(-1) ?? null
  return {
    ok: true,
    access: verdict.access === 'Allow' ? 'Access allowed' : 'Access denied',
    ruleName: last?.ruleName ?? null,
    nsgId: last?.nsgId ?? null,
    nsgName: last?.nsgName ?? null,
    isDefaultRule: last ? last.ruleId === null : false,
    verdict,
  }
}

export interface EffectiveRule extends SecurityRuleProperties {
  /** `securityRules/<name>` or `defaultSecurityRules/<name>`, as the CLI shows them (NW-4). */
  name: string
}

export interface EffectiveNsg {
  association: 'Subnet' | 'NetworkInterface'
  nsgId: ArmId
  nsgName: string
  rules: EffectiveRule[]
}

/**
 * Effective security rules of a NIC (NW-4): the rules of the NSG on the NIC and on its subnet, one
 * entry per NSG. Only for a running VM with at least one NSG (VM-5).
 */
export function effectiveSecurityRules(world: World, nicId: ArmId): { ok: true; nsgs: EffectiveNsg[] } | { ok: false; refusal: Refusal } {
  const nic = getResource(world, nicId)
  const config = nic ? ipConfigurationsOf(nic)[0] : undefined
  if (!nic || !config) return { ok: false, refusal: missing(`Network interface '${nicId}'`) }
  const vm = Object.values(world.tenant.resources).find(r =>
    r.type.toLowerCase() === VM_TYPE.toLowerCase() && networkInterfacesOf(r).some(n => sameName(n.id, nic.id)))
  if (!vm || world.runtime[armKey(vm.id)]?.powerState !== 'running') {
    return { ok: false, refusal: { kind: 'rule', ruleId: 'VM-5', message: 'Effective security rules are only shown for a network interface attached to a running VM.' } }
  }
  const subnet = getResource(world, config.properties.subnet.id)
  const pairs: ['Subnet' | 'NetworkInterface', ArmId | null][] = [
    ['NetworkInterface', nicNsgId(nic)],
    ['Subnet', subnet ? refId(subnet.properties.networkSecurityGroup) : null],
  ]
  const nsgs: EffectiveNsg[] = []
  for (const [association, nsgId] of pairs) {
    const nsg = nsgId ? getResource(world, nsgId) : undefined
    if (!nsg) continue
    const rules = (['Inbound', 'Outbound'] as const).flatMap(direction =>
      rulesInOrder(world, nsg, direction).map(c => ({ ...c.rule, name: `${c.id ? 'securityRules' : 'defaultSecurityRules'}/${c.name}` })))
    nsgs.push({ association, nsgId: nsg.id, nsgName: nsg.name, rules })
  }
  if (nsgs.length === 0) {
    return { ok: false, refusal: { kind: 'rule', ruleId: 'VM-5', message: 'Effective security rules are only shown when an NSG is associated with the network interface or its subnet.' } }
  }
  return { ok: true, nsgs }
}
