import type { ArmId, World } from '../world.ts'
import { armKey, parentResourceId } from './armId.ts'
import { getResource, refId } from './common.ts'
import { ipConfigurationsOf, nicNsgId } from './networkInterfaces.ts'
import { VM_TYPE, networkInterfacesOf } from './virtualMachines.ts'
import { NIC_TYPE, SUBNET_TYPE } from './virtualNetworks.ts'

/**
 * What a resource depends on, read only from stored references (CLAUDE.md rule 6: dependencies are
 * derived, never stored). One function for the canvas, deployment ordering and delete protection.
 *
 * - `parent`: a child resource and the resource it belongs to (subnet → VNet, SUB-9s; security rule → NSG, NSG-13s)
 * - `networkSecurityGroup`: a subnet or NIC and its associated NSG (NSG-12)
 * - `subnet`: a NIC's IP configuration and its subnet (NIC-2)
 * - `publicIPAddress`: a NIC's IP configuration and its public IP (PIP-8)
 * - `networkInterface`: a VM and its NICs (VM-16s)
 * - `osDisk`: a VM and its managed OS disk (VM-15s)
 */
export type DependencyKind = 'parent' | 'networkSecurityGroup' | 'subnet' | 'publicIPAddress' | 'networkInterface' | 'osDisk'

export interface Dependency {
  /** The dependent resource. */
  from: ArmId
  /** The resource it depends on. Only references to resources that exist are returned. */
  to: ArmId
  kind: DependencyKind
}

const isType = (type: string, expected: string) => type.toLowerCase() === expected.toLowerCase()

/** Dependencies of one resource, in a stable order. */
export function dependenciesOf(world: World, id: ArmId): Dependency[] {
  const resource = getResource(world, id)
  if (!resource) return []
  const out: Dependency[] = []
  const add = (to: ArmId | null | undefined, kind: DependencyKind) => {
    const target = to ? getResource(world, to) : undefined
    if (target) out.push({ from: resource.id, to: target.id, kind })
  }

  const parent = parentResourceId(resource.id)
  if (parent) add(parent, 'parent')

  if (isType(resource.type, SUBNET_TYPE)) add(refId(resource.properties.networkSecurityGroup), 'networkSecurityGroup')

  if (isType(resource.type, NIC_TYPE)) {
    for (const c of ipConfigurationsOf(resource)) {
      add(c.properties.subnet.id, 'subnet')
      add(c.properties.publicIPAddress?.id, 'publicIPAddress')
    }
    add(nicNsgId(resource), 'networkSecurityGroup')
  }

  if (isType(resource.type, VM_TYPE)) {
    for (const nic of networkInterfacesOf(resource)) add(nic.id, 'networkInterface')
    const disk = (resource.properties.storageProfile as { osDisk?: { managedDisk?: { id?: string } } } | undefined)?.osDisk?.managedDisk?.id
    add(disk, 'osDisk')
  }
  return out
}

/** Every dependency in the tenant, in a stable order (by resource key). */
export function allDependencies(world: World): Dependency[] {
  return Object.keys(world.tenant.resources).sort().flatMap(key => {
    const r = world.tenant.resources[key]
    return r ? dependenciesOf(world, r.id) : []
  })
}

/** The resources that depend on `id` (the reverse of dependenciesOf). */
export function dependentsOf(world: World, id: ArmId): Dependency[] {
  const key = armKey(id)
  return allDependencies(world).filter(d => armKey(d.to) === key)
}
