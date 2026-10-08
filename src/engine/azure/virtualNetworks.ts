import type { CommandHandler, Refusal } from '../commands.ts'
import type { ArmId, Resource, World } from '../world.ts'
import { parentResourceId, parseArmId, resourceId, sameName } from './armId.ts'
import { containsCidr, formatCidr, overlaps, parseCidr, type Cidr } from './cidr.ts'
import {
  armWrite, checkRegion, checkScope, childResources, firstRefusal, getResource, missing, notModelled, putResource, refId,
  resourcesOfType, rule, stamp,
} from './common.ts'
import { checkSubnetName, checkVirtualNetworkName } from './names.ts'

export const VNET_TYPE = 'Microsoft.Network/virtualNetworks'
export const SUBNET_TYPE = 'Microsoft.Network/virtualNetworks/subnets'
export const NIC_TYPE = 'Microsoft.Network/networkInterfaces'
export const NSG_TYPE = 'Microsoft.Network/networkSecurityGroups'

// ── Address rules ───────────────────────────────────────────────────────────────────────────────

const cidrs = (texts: string[]): Cidr[] => texts.map(t => parseCidr(t)).filter((c): c is NonNullable<typeof c> => c !== null)

/** Ranges that can't be added to a virtual network (VNET-3). */
const BLOCKED = cidrs(['224.0.0.0/4', '255.255.255.255/32', '127.0.0.0/8', '169.254.0.0/16', '168.63.129.16/32'])
/** RFC 1918 and RFC 6598, the ranges Learn recommends (VNET-2). Anything else isn't modelled (VNET-2s). */
const RECOMMENDED = cidrs(['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10'])

/** Parses one CIDR block for a VNet or subnet: written in CIDR form (VNET-7), on its boundary (VNET-8u). */
function parseBlock(text: string, what: string): Cidr | Refusal {
  const c = parseCidr(text)
  if (!c) return rule('VNET-7', `${what} '${text}' isn't a CIDR block such as 10.0.0.0/16.`)
  if (!c.aligned) {
    return notModelled('VNET-8u', `'${text}' isn't on its network boundary (that would be ${formatCidr(c)}). The simulator doesn't guess how Azure treats it.`)
  }
  return c
}
const isRefusal = (x: Cidr | Refusal): x is Refusal => 'kind' in x

export function checkAddressSpace(prefixes: string[]): Refusal | null {
  if (prefixes.length === 0) return rule('VNET-7', 'A virtual network needs at least one address block.')
  const blocks: Cidr[] = []
  for (const text of prefixes) {
    const c = parseBlock(text, 'Address space')
    if (isRefusal(c)) return c
    const blocked = BLOCKED.find(b => overlaps(b, c))
    if (blocked) return rule('VNET-3', `'${text}' includes ${formatCidr(blocked)}, which can't be added to a virtual network.`)
    if (!RECOMMENDED.some(r => containsCidr(r, c))) {
      return notModelled('VNET-2s', `'${text}' is outside 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 and 100.64.0.0/10. `
        + 'Other ranges "might work but have undesirable side effects", which the simulator doesn\'t model.')
    }
    if (blocks.some(b => overlaps(b, c))) return notModelled('VNET-8u', `'${text}' overlaps another block of the same address space.`)
    blocks.push(c)
  }
  return null
}

// ── Lookups shared with other modules ──────────────────────────────────────────────────────────

export const subnetsOf = (world: World, vnetId: ArmId): Resource[] => childResources(world, vnetId, SUBNET_TYPE)

export const addressPrefixesOf = (vnet: Resource): string[] =>
  ((vnet.properties.addressSpace as { addressPrefixes?: string[] } | undefined)?.addressPrefixes ?? []).slice()

/** NICs whose IP configuration sits in this subnet. */
export function nicsInSubnet(world: World, subnetId: ArmId): Resource[] {
  return resourcesOfType(world, NIC_TYPE).filter(nic =>
    ((nic.properties.ipConfigurations as { properties: { subnet?: unknown } }[] | undefined) ?? []).some(c =>
      sameName(refId(c.properties.subnet) ?? '', subnetId)),
  )
}

// ── Virtual network ─────────────────────────────────────────────────────────────────────────────

export interface VirtualNetworkWrite {
  subscriptionId: string
  resourceGroupName: string
  name: string
  location: string
  addressPrefixes: string[]
  tags?: Record<string, string>
}

const vnetId = (p: VirtualNetworkWrite) => resourceId(p.subscriptionId, p.resourceGroupName, VNET_TYPE, p.name)

/** Create a virtual network: one region (VNET-1), an address space in CIDR blocks (VNET-7). */
export const writeVirtualNetwork: CommandHandler<VirtualNetworkWrite> = {
  type: 'arm/virtualNetworks/write',
  write: ({ payload }) => armWrite(VNET_TYPE, vnetId(payload)),
  validate: (world, { payload }) =>
    firstRefusal(
      () => checkScope(world, payload.subscriptionId, payload.resourceGroupName),
      () => checkVirtualNetworkName(payload.name),
      () => checkRegion(payload.location),
      () => (getResource(world, vnetId(payload))
        ? notModelled('VNET-9u', `Virtual network '${payload.name}' already exists. Changing an existing virtual network isn't modelled yet.`)
        : null),
      () => checkAddressSpace(payload.addressPrefixes),
    ),
  apply: (world, { payload, caller }) =>
    putResource(world, stamp(world, caller, {
      id: vnetId(payload),
      type: VNET_TYPE,
      name: payload.name,
      location: payload.location,
      tags: { ...(payload.tags ?? {}) },
      // Subnets are child resources; the VNet's subnet list is derived from them (SUB-9s).
      properties: { addressSpace: { addressPrefixes: [...payload.addressPrefixes] } },
    })),
}

// ── Subnet ──────────────────────────────────────────────────────────────────────────────────────

export interface SubnetWrite {
  virtualNetworkId: ArmId
  name: string
  addressPrefix: string
  /** Associate an NSG (NSG-12), or null / absent for none. */
  networkSecurityGroupId?: ArmId | null
}

function subnetTarget(p: SubnetWrite): ArmId | null {
  const parsed = parseArmId(p.virtualNetworkId)
  if (parsed?.type?.toLowerCase() !== VNET_TYPE.toLowerCase()) return null
  return `${p.virtualNetworkId}/subnets/${p.name}`
}

/** Checks an NSG association. Cross-region or cross-subscription associations aren't modelled (NSG-10). */
export function checkNsgAssociation(world: World, nsgId: ArmId, host: Pick<Resource, 'id' | 'location'>): Refusal | null {
  const nsg = getResource(world, nsgId)
  if (!nsg || nsg.type.toLowerCase() !== NSG_TYPE.toLowerCase()) return missing(`Network security group '${nsgId}'`)
  if (nsg.location !== host.location || parseArmId(nsg.id)?.subscriptionId !== parseArmId(host.id)?.subscriptionId) {
    return notModelled('NSG-10', 'The network security group is in a different region or subscription. Learn doesn\'t say whether that\'s allowed, so the simulator doesn\'t model it.')
  }
  return null
}

function checkSubnet(world: World, p: SubnetWrite): Refusal | null {
  const id = subnetTarget(p)
  if (!id) return missing(`Virtual network '${p.virtualNetworkId}'`)
  const vnet = getResource(world, p.virtualNetworkId)
  if (!vnet) return missing(`Virtual network '${p.virtualNetworkId}'`)

  const nameRefusal = checkSubnetName(p.name)
  if (nameRefusal) return nameRefusal

  const block = parseBlock(p.addressPrefix, 'Subnet address range')
  if (isRefusal(block)) return block
  if (block.prefix < 2 || block.prefix > 29) {
    return rule('SUB-1', `A /${block.prefix} subnet isn't supported: the smallest IPv4 subnet is /29 and the largest is /2.`)
  }
  if (!cidrs(addressPrefixesOf(vnet)).some(space => containsCidr(space, block))) {
    return rule('SUB-4', `${p.addressPrefix} isn't inside the address space of '${vnet.name}' (${addressPrefixesOf(vnet).join(', ')}).`)
  }
  const existing = getResource(world, id)
  const clash = subnetsOf(world, vnet.id).find(s => !sameName(s.id, id) && overlaps(parseCidr(String(s.properties.addressPrefix)) ?? block, block))
  if (clash) return rule('SUB-3', `${p.addressPrefix} overlaps subnet '${clash.name}' (${String(clash.properties.addressPrefix)}). Subnet ranges can't overlap.`)

  if (existing && existing.properties.addressPrefix !== p.addressPrefix && nicsInSubnet(world, existing.id).length > 0) {
    return rule('SUB-5', `Subnet '${existing.name}' has network interfaces in it, so its range can't change.`)
  }
  if (p.networkSecurityGroupId) return checkNsgAssociation(world, p.networkSecurityGroupId, vnet)
  return null
}

/**
 * Create or update a subnet (SUB-9s: a child resource). Updating is how an NSG is associated
 * or removed (NSG-12). Subnets are private by default (SUB-7, SUB-7s).
 */
export const writeSubnet: CommandHandler<SubnetWrite> = {
  type: 'arm/subnets/write',
  write: ({ payload }) => {
    const id = subnetTarget(payload)
    return id ? armWrite(SUBNET_TYPE, id) : null
  },
  validate: (world, { payload }) => checkSubnet(world, payload),
  apply(world, { payload, caller }) {
    const id = subnetTarget(payload)
    const vnet = getResource(world, payload.virtualNetworkId)
    if (!id || !vnet) return world
    return putResource(world, stamp(world, caller, {
      id,
      type: SUBNET_TYPE,
      name: payload.name,
      location: vnet.location,
      tags: {},
      properties: {
        addressPrefix: payload.addressPrefix,
        defaultOutboundAccess: false,
        ...(payload.networkSecurityGroupId ? { networkSecurityGroup: { id: payload.networkSecurityGroupId } } : {}),
      },
    }))
  },
}

/** The VNet a subnet belongs to. */
export const vnetOfSubnet = (world: World, subnetId: ArmId): Resource | undefined => {
  const parent = parentResourceId(subnetId)
  return parent ? getResource(world, parent) : undefined
}
