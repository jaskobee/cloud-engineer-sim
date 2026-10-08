import type { CommandHandler, Refusal } from '../commands.ts'
import type { ArmId, Resource, World } from '../world.ts'
import { parentResourceId, parseArmId, resourceId, sameName } from './armId.ts'
import { parseCidr, parseIPv4 } from './cidr.ts'
import {
  armWrite, checkRegion, checkScope, childResources, firstRefusal, getResource, missing, notModelled, putResource,
  removeResource, rule, stamp,
} from './common.ts'
import { checkNsgName, checkSecurityRuleName } from './names.ts'
import { NSG_TYPE } from './virtualNetworks.ts'

export const SECURITY_RULE_TYPE = 'Microsoft.Network/networkSecurityGroups/securityRules'

export type Direction = 'Inbound' | 'Outbound'
export type Access = 'Allow' | 'Deny'
/** ARM protocol values (NSG-11). `*` means any protocol. */
export type Protocol = '*' | 'Ah' | 'Esp' | 'Icmp' | 'Tcp' | 'Udp'

/** Security rule properties, single-value fields only (NSG-11, NSG-11s). */
export interface SecurityRuleProperties {
  priority: number
  direction: Direction
  access: Access
  protocol: Protocol
  sourceAddressPrefix: string
  sourcePortRange: string
  destinationAddressPrefix: string
  destinationPortRange: string
  description?: string
}

export interface DefaultSecurityRule extends SecurityRuleProperties {
  name: string
}

/** The six default rules every NSG gets (NSG-3, NSG-3a). Protocol stored as `*` and shown as Any (NSG-3s). */
export const DEFAULT_SECURITY_RULES: readonly DefaultSecurityRule[] = [
  { name: 'AllowVNetInBound', priority: 65000, direction: 'Inbound', access: 'Allow', protocol: '*', sourceAddressPrefix: 'VirtualNetwork', sourcePortRange: '0-65535', destinationAddressPrefix: 'VirtualNetwork', destinationPortRange: '0-65535' },
  { name: 'AllowAzureLoadBalancerInBound', priority: 65001, direction: 'Inbound', access: 'Allow', protocol: '*', sourceAddressPrefix: 'AzureLoadBalancer', sourcePortRange: '0-65535', destinationAddressPrefix: '0.0.0.0/0', destinationPortRange: '0-65535' },
  { name: 'DenyAllInbound', priority: 65500, direction: 'Inbound', access: 'Deny', protocol: '*', sourceAddressPrefix: '0.0.0.0/0', sourcePortRange: '0-65535', destinationAddressPrefix: '0.0.0.0/0', destinationPortRange: '0-65535' },
  { name: 'AllowVnetOutBound', priority: 65000, direction: 'Outbound', access: 'Allow', protocol: '*', sourceAddressPrefix: 'VirtualNetwork', sourcePortRange: '0-65535', destinationAddressPrefix: 'VirtualNetwork', destinationPortRange: '0-65535' },
  { name: 'AllowInternetOutBound', priority: 65001, direction: 'Outbound', access: 'Allow', protocol: '*', sourceAddressPrefix: '0.0.0.0/0', sourcePortRange: '0-65535', destinationAddressPrefix: 'Internet', destinationPortRange: '0-65535' },
  { name: 'DenyAllOutBound', priority: 65500, direction: 'Outbound', access: 'Deny', protocol: '*', sourceAddressPrefix: '0.0.0.0/0', sourcePortRange: '0-65535', destinationAddressPrefix: '0.0.0.0/0', destinationPortRange: '0-65535' },
]

// ── Network security group ──────────────────────────────────────────────────────────────────────

export interface NsgWrite {
  subscriptionId: string
  resourceGroupName: string
  name: string
  location: string
  tags?: Record<string, string>
}

const nsgId = (p: NsgWrite) => resourceId(p.subscriptionId, p.resourceGroupName, NSG_TYPE, p.name)

/** Create a network security group with Azure's six default rules (NSG-3). */
export const writeNetworkSecurityGroup: CommandHandler<NsgWrite> = {
  type: 'arm/networkSecurityGroups/write',
  write: ({ payload }) => armWrite(NSG_TYPE, nsgId(payload)),
  validate: (world, { payload }) =>
    firstRefusal(
      () => checkScope(world, payload.subscriptionId, payload.resourceGroupName),
      () => checkNsgName(payload.name),
      () => checkRegion(payload.location),
      () => (getResource(world, nsgId(payload))
        ? notModelled('ARM-4u', `Network security group '${payload.name}' already exists. Changing its settings isn't modelled yet; its rules can be changed.`)
        : null),
    ),
  apply: (world, { payload, caller }) =>
    putResource(world, stamp(world, caller, {
      id: nsgId(payload),
      type: NSG_TYPE,
      name: payload.name,
      location: payload.location,
      tags: { ...(payload.tags ?? {}) },
      properties: { defaultSecurityRules: DEFAULT_SECURITY_RULES.map(r => ({ ...r })) },
    })),
}

// ── Security rules ──────────────────────────────────────────────────────────────────────────────

const SERVICE_TAGS = ['VirtualNetwork', 'AzureLoadBalancer', 'Internet'] as const

/** `*`, a port, or a range `a-b`, each 0–65535 (NSG-11). */
function checkPortRange(value: string, field: string): Refusal | null {
  if (value === '*') return null
  const m = /^(0|[1-9]\d{0,4})(?:-(0|[1-9]\d{0,4}))?$/.exec(value)
  const low = m ? Number(m[1]) : NaN
  const high = m?.[2] === undefined ? low : Number(m[2])
  if (!m || low > 65535 || high > 65535) {
    if (/[,\s]/.test(value)) return notModelled('NSG-11s', `Lists of ports in one field aren't modelled yet. Use a single port, a range or *.`)
    return rule('NSG-11', `${field} must be a port or range between 0 and 65535, or * for any port.`)
  }
  if (low > high) return notModelled('NSG-11s', `${field} '${value}' runs backwards. The simulator doesn't guess how Azure treats it.`)
  return null
}

/** `*`, a default service tag, an IPv4 address or a CIDR block (NSG-5, NSG-11). */
function checkAddressPrefix(value: string, field: string): Refusal | null {
  if (value === '*' || (SERVICE_TAGS as readonly string[]).includes(value)) return null
  if (parseIPv4(value) !== null) return null
  const c = parseCidr(value)
  if (c) {
    return c.aligned ? null : notModelled('VNET-8u', `${field} '${value}' isn't on its network boundary. The simulator doesn't guess how Azure treats it.`)
  }
  if (value.includes('-') || value.includes(',')) {
    return notModelled('NSG-11s', `${field}: address ranges and lists aren't modelled yet. Use one address, one CIDR block, a service tag or *.`)
  }
  if (/^[A-Za-z][A-Za-z0-9.]*$/.test(value)) {
    return notModelled('NSG-11s', `Service tag '${value}' isn't modelled yet. Supported: ${SERVICE_TAGS.join(', ')}.`)
  }
  return rule('NSG-11', `${field} must be a CIDR block, an IP address, a service tag or *.`)
}

export interface SecurityRuleWrite {
  networkSecurityGroupId: ArmId
  name: string
  properties: SecurityRuleProperties
}

function ruleTarget(p: SecurityRuleWrite): ArmId | null {
  const parsed = parseArmId(p.networkSecurityGroupId)
  if (parsed?.type?.toLowerCase() !== NSG_TYPE.toLowerCase()) return null
  return `${p.networkSecurityGroupId}/securityRules/${p.name}`
}

export const securityRulesOf = (world: World, nsg: ArmId): Resource[] => childResources(world, nsg, SECURITY_RULE_TYPE)

export const ruleProperties = (r: Resource): SecurityRuleProperties => r.properties as unknown as SecurityRuleProperties

function checkSecurityRule(world: World, p: SecurityRuleWrite): Refusal | null {
  const id = ruleTarget(p)
  if (!id || !getResource(world, p.networkSecurityGroupId)) return missing(`Network security group '${p.networkSecurityGroupId}'`)
  const props = p.properties
  return firstRefusal(
    () => checkSecurityRuleName(p.name),
    () => (DEFAULT_SECURITY_RULES.some(d => sameName(d.name, p.name))
      ? notModelled('NSG-13s', `'${p.name}' is the name of a default rule. Default rules are read-only.`)
      : null),
    () => (Number.isInteger(props.priority) && props.priority >= 100 && props.priority <= 4096
      ? null
      : rule('NSG-1', 'Priority must be a whole number from 100 to 4096. Lower numbers are processed first.')),
    () => (props.direction === 'Inbound' || props.direction === 'Outbound' ? null : rule('NSG-11', 'Direction is Inbound or Outbound.')),
    () => (props.access === 'Allow' || props.access === 'Deny' ? null : rule('NSG-11', 'Action is Allow or Deny.')),
    () => (['*', 'Ah', 'Esp', 'Icmp', 'Tcp', 'Udp'].includes(props.protocol)
      ? null
      : rule('NSG-11', 'Protocol is one of *, Tcp, Udp, Icmp, Esp or Ah.')),
    () => checkAddressPrefix(props.sourceAddressPrefix, 'Source'),
    () => checkPortRange(props.sourcePortRange, 'Source port range'),
    () => checkAddressPrefix(props.destinationAddressPrefix, 'Destination'),
    () => checkPortRange(props.destinationPortRange, 'Destination port range'),
    () => ((props.description ?? '').length <= 140 ? null : rule('NSG-11', 'A rule description is at most 140 characters.')),
    () => {
      const other = securityRulesOf(world, p.networkSecurityGroupId).find(r =>
        !sameName(r.id, id) && ruleProperties(r).priority === props.priority)
      if (!other) return null
      if (ruleProperties(other).direction === props.direction) {
        return rule('NSG-2', `Rule '${other.name}' already uses priority ${props.priority} for ${props.direction.toLowerCase()} traffic. Each priority can be used once.`)
      }
      return notModelled('NSG-2u', `Rule '${other.name}' uses priority ${props.priority} in the other direction. Learn doesn't say whether that's allowed, so the simulator doesn't model it. Pick another number.`)
    },
  )
}

/** Create or update a security rule (NSG-13s): a PUT on the rule's name replaces its settings. */
export const writeSecurityRule: CommandHandler<SecurityRuleWrite> = {
  type: 'arm/securityRules/write',
  write: ({ payload }) => {
    const id = ruleTarget(payload)
    return id ? armWrite(SECURITY_RULE_TYPE, id) : null
  },
  validate: (world, { payload }) => checkSecurityRule(world, payload),
  apply(world, { payload, caller }) {
    const id = ruleTarget(payload)
    const nsg = getResource(world, payload.networkSecurityGroupId)
    if (!id || !nsg) return world
    const { description, ...rest } = payload.properties
    return putResource(world, stamp(world, caller, {
      id,
      type: SECURITY_RULE_TYPE,
      name: payload.name,
      location: nsg.location,
      tags: {},
      properties: { ...rest, ...(description ? { description } : {}) },
    }))
  },
}

/** Remove a security rule (NSG-13s). Rule changes only affect new connections (NSG-4). */
export const deleteSecurityRule: CommandHandler<{ securityRuleId: ArmId }> = {
  type: 'arm/securityRules/delete',
  write: ({ payload }) => armWrite(SECURITY_RULE_TYPE, payload.securityRuleId, 'delete'),
  validate(world, { payload }) {
    const existing = getResource(world, payload.securityRuleId)
    if (!existing || existing.type.toLowerCase() !== SECURITY_RULE_TYPE.toLowerCase()) return missing(`Security rule '${payload.securityRuleId}'`)
    return null
  },
  apply: (world, { payload }) => removeResource(world, payload.securityRuleId),
}

/** The NSG a security rule belongs to. */
export const nsgOfRule = (world: World, ruleId: ArmId): Resource | undefined => {
  const parent = parentResourceId(ruleId)
  return parent ? getResource(world, parent) : undefined
}
