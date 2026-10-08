import type { CommandHandler, Refusal } from '../commands.ts'
import type { ArmId, Resource, World } from '../world.ts'
import { parseArmId, resourceId, sameName } from './armId.ts'
import { containsAddress, formatIPv4, lastAddress, parseCidr, parseIPv4 } from './cidr.ts'
import {
  armWrite, checkRegion, checkScope, firstRefusal, getResource, missing, notModelled, putResource, refId, resourcesOfType,
  rule, stamp,
} from './common.ts'
import { checkNicName, checkPublicIpName } from './names.ts'
import { NIC_TYPE, SUBNET_TYPE, checkNsgAssociation, nicsInSubnet, vnetOfSubnet } from './virtualNetworks.ts'

export const PUBLIC_IP_TYPE = 'Microsoft.Network/publicIPAddresses'

// ── Public IP address ───────────────────────────────────────────────────────────────────────────

export interface PublicIpWrite {
  subscriptionId: string
  resourceGroupName: string
  name: string
  location: string
  sku: { name: string; tier?: string }
  publicIPAllocationMethod: string
  publicIPAddressVersion?: string
  tags?: Record<string, string>
}

const publicIpId = (p: PublicIpWrite) => resourceId(p.subscriptionId, p.resourceGroupName, PUBLIC_IP_TYPE, p.name)

/** Made-up public addresses from the documentation range 198.51.100.0/24 (PIP-7s), from .10 upwards. */
function nextPublicAddress(world: World): string | null {
  const used = new Set(resourcesOfType(world, PUBLIC_IP_TYPE).map(p => String(p.properties.ipAddress)))
  for (let host = 10; host < 255; host++) {
    const candidate = `198.51.100.${host}`
    if (!used.has(candidate)) return candidate
  }
  return null
}

function checkPublicIpSettings(p: PublicIpWrite): Refusal | null {
  if (p.sku.name === 'Basic') return rule('PIP-2', 'Basic SKU public IP addresses were retired on 30 September 2025. Use Standard.')
  if (p.sku.name !== 'Standard') return notModelled('PIP-6s', `SKU '${p.sku.name}' isn't modelled. The simulator offers Standard.`)
  if (p.sku.tier !== undefined && p.sku.tier !== 'Regional') return notModelled('PIP-6s', `Tier '${p.sku.tier}' isn't modelled. The simulator offers Regional.`)
  if (p.publicIPAllocationMethod === 'Dynamic') {
    return notModelled('PIP-5u', 'Dynamic allocation for a Standard public IP isn\'t modelled; Learn is unclear on it. Use Static.')
  }
  if (p.publicIPAllocationMethod !== 'Static') return rule('PIP-6', 'Allocation is Dynamic or Static.')
  if ((p.publicIPAddressVersion ?? 'IPv4') !== 'IPv4') return notModelled('PIP-6s', 'Only IPv4 public addresses are modelled.')
  return null
}

/** Create a Standard public IP. It's closed to inbound traffic until an NSG allows it (PIP-1). */
export const writePublicIpAddress: CommandHandler<PublicIpWrite> = {
  type: 'arm/publicIPAddresses/write',
  write: ({ payload }) => armWrite(PUBLIC_IP_TYPE, publicIpId(payload)),
  validate: (world, { payload }) =>
    firstRefusal(
      () => checkScope(world, payload.subscriptionId, payload.resourceGroupName),
      () => checkPublicIpName(payload.name),
      () => checkRegion(payload.location),
      () => (getResource(world, publicIpId(payload))
        ? notModelled('ARM-4u', `Public IP address '${payload.name}' already exists. Changing it isn't modelled yet.`)
        : null),
      () => checkPublicIpSettings(payload),
      () => (nextPublicAddress(world) ? null : notModelled('PIP-7s', 'The simulator has run out of made-up public addresses.')),
    ),
  apply(world, { payload, caller }) {
    const address = nextPublicAddress(world)
    if (!address) return world
    return putResource(world, stamp(world, caller, {
      id: publicIpId(payload),
      type: PUBLIC_IP_TYPE,
      name: payload.name,
      location: payload.location,
      tags: { ...(payload.tags ?? {}) },
      sku: { name: 'Standard', tier: 'Regional' },
      properties: { publicIPAllocationMethod: 'Static', publicIPAddressVersion: 'IPv4', ipAddress: address },
    }))
  },
}

// ── Network interface ───────────────────────────────────────────────────────────────────────────

export interface NicWrite {
  subscriptionId: string
  resourceGroupName: string
  name: string
  location: string
  subnetId: ArmId
  /** Dynamic is the default (PRIV-1). */
  privateIPAllocationMethod?: 'Dynamic' | 'Static'
  /** Required for Static. */
  privateIPAddress?: string
  publicIPAddressId?: ArmId | null
  networkSecurityGroupId?: ArmId | null
  tags?: Record<string, string>
}

/** The one IP configuration the sim models per NIC (NIC-7, NIC-8s). */
export interface IpConfiguration {
  name: string
  properties: {
    primary: boolean
    privateIPAllocationMethod: 'Dynamic' | 'Static'
    privateIPAddress: string
    privateIPAddressVersion: 'IPv4'
    subnet: { id: ArmId }
    publicIPAddress?: { id: ArmId }
  }
}

const nicId = (p: NicWrite) => resourceId(p.subscriptionId, p.resourceGroupName, NIC_TYPE, p.name)

export const ipConfigurationsOf = (nic: Resource): IpConfiguration[] =>
  (nic.properties.ipConfigurations as IpConfiguration[] | undefined) ?? []

/** Private addresses held by NICs in a subnet, except `exceptNic`'s own. */
function usedAddresses(world: World, subnetId: ArmId, exceptNic: ArmId): Set<number> {
  const used = new Set<number>()
  for (const nic of nicsInSubnet(world, subnetId)) {
    if (sameName(nic.id, exceptNic)) continue
    for (const c of ipConfigurationsOf(nic)) {
      const a = parseIPv4(c.properties.privateIPAddress)
      if (a !== null) used.add(a)
    }
  }
  return used
}

/** Lowest free address after the four reserved at the start and before the reserved last one (SUB-2, PRIV-1s). */
function nextPrivateAddress(world: World, subnet: Resource, exceptNic: ArmId): string | null {
  const block = parseCidr(String(subnet.properties.addressPrefix))
  if (!block) return null
  const used = usedAddresses(world, subnet.id, exceptNic)
  for (let a = block.network + 4; a < lastAddress(block); a++) if (!used.has(a)) return formatIPv4(a)
  return null
}

function checkStaticAddress(world: World, subnet: Resource, text: string | undefined, nic: ArmId): Refusal | null {
  const address = text === undefined ? null : parseIPv4(text)
  const block = parseCidr(String(subnet.properties.addressPrefix))
  if (address === null || !block) return rule('PRIV-2', 'A static private address must be an IPv4 address in the subnet\'s range.')
  if (!containsAddress(block, address)) {
    return rule('PRIV-2', `${text} isn't in subnet '${subnet.name}' (${String(subnet.properties.addressPrefix)}).`)
  }
  if (address < block.network + 4 || address === lastAddress(block)) {
    return rule('SUB-2', `${text} is one of the five addresses Azure reserves in every subnet: the first four and the last.`)
  }
  if (usedAddresses(world, subnet.id, nic).has(address)) return rule('PRIV-2', `${text} is already assigned to another network interface.`)
  return null
}

function checkPublicIpAssociation(world: World, pipId: ArmId, nic: { id: ArmId; location: string; subscriptionId: string }): Refusal | null {
  const pip = getResource(world, pipId)
  if (!pip || pip.type.toLowerCase() !== PUBLIC_IP_TYPE.toLowerCase()) return missing(`Public IP address '${pipId}'`)
  if (pip.location !== nic.location || parseArmId(pip.id)?.subscriptionId !== nic.subscriptionId) {
    return notModelled('PIP-9u', 'The public IP is in a different region or subscription. Learn doesn\'t say whether that\'s allowed, so the simulator doesn\'t model it.')
  }
  const holder = resourcesOfType(world, NIC_TYPE).find(other =>
    !sameName(other.id, nic.id) && ipConfigurationsOf(other).some(c => sameName(c.properties.publicIPAddress?.id ?? '', pipId)))
  if (holder) return notModelled('PIP-9u', `Public IP '${pip.name}' is already associated with '${holder.name}'. Sharing one isn't modelled.`)
  return null
}

function checkNic(world: World, p: NicWrite): Refusal | null {
  const id = nicId(p)
  const scope = checkScope(world, p.subscriptionId, p.resourceGroupName)
  if (scope) return scope
  const subnet = getResource(world, p.subnetId)
  if (!subnet || subnet.type.toLowerCase() !== SUBNET_TYPE.toLowerCase()) return missing(`Subnet '${p.subnetId}'`)
  const vnet = vnetOfSubnet(world, subnet.id)
  if (!vnet) return missing(`Virtual network of '${p.subnetId}'`)

  const existing = getResource(world, id)
  const current = existing ? ipConfigurationsOf(existing)[0] : undefined
  const method = p.privateIPAllocationMethod ?? 'Dynamic'

  return firstRefusal(
    () => checkNicName(p.name),
    () => checkRegion(p.location),
    () => (vnet.location === p.location && parseArmId(vnet.id)?.subscriptionId === p.subscriptionId
      ? null
      : rule('VNET-6', `A network interface can only use a virtual network in its own region and subscription. '${vnet.name}' is in ${vnet.location}.`)),
    () => {
      if (!current) return null
      const sameSubnet = sameName(current.properties.subnet.id, p.subnetId)
      const sameAddress = method === current.properties.privateIPAllocationMethod
        && (method === 'Dynamic' || p.privateIPAddress === current.properties.privateIPAddress)
      return sameSubnet && sameAddress
        ? null
        : notModelled('NIC-8s', `Changing the subnet or private address of '${p.name}' isn't modelled yet. Its NSG and public IP can be changed.`)
    },
    () => (method === 'Static' && !current ? checkStaticAddress(world, subnet, p.privateIPAddress, id) : null),
    () => (method === 'Dynamic' && !current && !nextPrivateAddress(world, subnet, id)
      ? notModelled('PRIV-1s', `Subnet '${subnet.name}' has no free addresses left.`)
      : null),
    () => (p.publicIPAddressId ? checkPublicIpAssociation(world, p.publicIPAddressId, { id, location: p.location, subscriptionId: p.subscriptionId }) : null),
    () => (p.networkSecurityGroupId
      ? checkNsgAssociation(world, p.networkSecurityGroupId, { id, location: p.location })
      : null),
  )
}

/**
 * Create a network interface in a subnet, or change an existing one's NSG and public IP (NIC-8s).
 * A dynamic address is the lowest free one (PRIV-1, PRIV-1s); a static one must be free and
 * unreserved (PRIV-2, SUB-2).
 */
export const writeNetworkInterface: CommandHandler<NicWrite> = {
  type: 'arm/networkInterfaces/write',
  write: ({ payload }) => armWrite(NIC_TYPE, nicId(payload)),
  validate: (world, { payload }) => checkNic(world, payload),
  apply(world, { payload, caller }) {
    const id = nicId(payload)
    const subnet = getResource(world, payload.subnetId)
    if (!subnet) return world
    const current = (() => {
      const existing = getResource(world, id)
      return existing ? ipConfigurationsOf(existing)[0] : undefined
    })()
    const method = current?.properties.privateIPAllocationMethod ?? payload.privateIPAllocationMethod ?? 'Dynamic'
    const address = current?.properties.privateIPAddress
      ?? (method === 'Static' ? payload.privateIPAddress : nextPrivateAddress(world, subnet, id))
    if (!address) return world

    const ipConfiguration: IpConfiguration = {
      name: current?.name ?? 'ipconfig1',
      properties: {
        primary: true,
        privateIPAllocationMethod: method,
        privateIPAddress: address,
        privateIPAddressVersion: 'IPv4',
        subnet: { id: subnet.id },
        ...(payload.publicIPAddressId ? { publicIPAddress: { id: payload.publicIPAddressId } } : {}),
      },
    }
    return putResource(world, stamp(world, caller, {
      id,
      type: NIC_TYPE,
      name: payload.name,
      location: payload.location,
      tags: { ...(payload.tags ?? {}) },
      properties: {
        ipConfigurations: [ipConfiguration],
        ...(payload.networkSecurityGroupId ? { networkSecurityGroup: { id: payload.networkSecurityGroupId } } : {}),
      },
    }))
  },
}

/** The NSG directly associated with a NIC, if any (NSG-12). */
export const nicNsgId = (nic: Resource): ArmId | null => refId(nic.properties.networkSecurityGroup)
