import type { Refusal, WriteTarget } from '../commands.ts'
import type { ArmId, Resource, ResourceGroup, World } from '../world.ts'
import { armKey, parseArmId, resourceGroupId } from './armId.ts'

/** Shared helpers for Azure command handlers. Every refusal cites a rule in Docs/AZURE_FACTS.md. */

export const rule = (ruleId: string, message: string): Refusal => ({ kind: 'rule', ruleId, message })
export const notModelled = (ruleId: string, message: string): Refusal => ({ kind: 'not-modelled', ruleId, message })
export const missing = (what: string): Refusal => ({ kind: 'invalid', code: 'arm/not-found', message: `${what} doesn't exist.` })

/** First refusal in a list of checks, or null. Lets handlers read top to bottom. */
export function firstRefusal(...checks: (() => Refusal | null)[]): Refusal | null {
  for (const check of checks) {
    const refusal = check()
    if (refusal) return refusal
  }
  return null
}

/** Regions the sim offers (REG-1). */
export const REGIONS = [
  { name: 'westeurope', displayName: 'West Europe' },
  { name: 'northeurope', displayName: 'North Europe' },
  { name: 'germanywestcentral', displayName: 'Germany West Central' },
] as const

export function checkRegion(location: string): Refusal | null {
  if (REGIONS.some(r => r.name === location)) return null
  return notModelled('REG-1', `The simulator only offers ${REGIONS.map(r => r.displayName).join(', ')}.`)
}

export const regionDisplayName = (location: string): string => REGIONS.find(r => r.name === location)?.displayName ?? location

// ── Lookups (case-insensitive, ARM-2s) ─────────────────────────────────────────────────────────

export const getResource = (world: World, id: ArmId): Resource | undefined => world.tenant.resources[armKey(id)]

export const getResourceGroup = (world: World, id: ArmId): ResourceGroup | undefined => world.tenant.resourceGroups[armKey(id)]

export function resourcesOfType(world: World, type: string): Resource[] {
  const t = type.toLowerCase()
  return Object.values(world.tenant.resources).filter(r => r.type.toLowerCase() === t)
}

/** Child resources of one type directly under a parent, e.g. the subnets of a VNet. */
export function childResources(world: World, parentId: ArmId, childType: string): Resource[] {
  const prefix = `${armKey(parentId)}/`
  return resourcesOfType(world, childType).filter(r => armKey(r.id).startsWith(prefix))
}

/** Reference to another resource as ARM stores it: `{ id }`. */
export interface IdRef {
  id: ArmId
}
export const refId = (value: unknown): ArmId | null =>
  typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string' ? (value as IdRef).id : null

// ── Writes ─────────────────────────────────────────────────────────────────────────────────────

export function putResource(world: World, resource: Resource): World {
  return { ...world, tenant: { ...world.tenant, resources: { ...world.tenant.resources, [armKey(resource.id)]: resource } } }
}

export function removeResource(world: World, id: ArmId): World {
  const resources = { ...world.tenant.resources }
  delete resources[armKey(id)]
  return { ...world, tenant: { ...world.tenant, resources } }
}

/**
 * A created or updated resource. Accepted writes are `Succeeded` at once until the deployment
 * engine (ARM-1, ARM-1s). An update keeps who created it.
 */
export function stamp(world: World, caller: string, fields: Omit<Resource, 'provisioningState' | 'createdBy' | 'changedAt'>): Resource {
  const existing = getResource(world, fields.id)
  return { ...fields, provisioningState: 'Succeeded', createdBy: existing?.createdBy ?? caller, changedAt: world.clock.now }
}

/** The activity log target of a write to `id` (ARM-3s): `{type}/write` or `{type}/delete`. */
export function armWrite(type: string, id: ArmId, verb: 'write' | 'delete' = 'write'): WriteTarget | null {
  const parsed = parseArmId(id)
  if (!parsed) return null
  return {
    operationName: `${type}/${verb}`,
    resourceId: id,
    subscriptionId: parsed.subscriptionId,
    resourceGroupName: parsed.resourceGroupName,
  }
}

/** Subscription and resource group must exist before anything is created in them. */
export function checkScope(world: World, subscriptionId: string, resourceGroupName: string): Refusal | null {
  if (!world.tenant.subscriptions[subscriptionId]) return missing(`Subscription '${subscriptionId}'`)
  if (!getResourceGroup(world, resourceGroupId(subscriptionId, resourceGroupName))) {
    return missing(`Resource group '${resourceGroupName}'`)
  }
  return null
}
