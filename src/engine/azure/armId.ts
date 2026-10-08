import type { ArmId } from '../world.ts'

/**
 * Azure Resource Manager IDs (ARM-2). Names are case-insensitive (NAME-6), so the world keys
 * everything by `armKey(id)` and keeps the original casing in the stored `id` (ARM-2s).
 */

/** The key a resource or resource group is stored under in the world. */
export const armKey = (id: ArmId): string => id.toLowerCase()

/** Case-insensitive name comparison (NAME-6). */
export const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/** `/subscriptions/{subscriptionId}/resourceGroups/{name}` (ARM-2). */
export function resourceGroupId(subscriptionId: string, resourceGroupName: string): ArmId {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`
}

/**
 * A resource ID in a resource group (ARM-2). `type` is the full type, child types included, and
 * `names` has one name per level: `resourceId(sub, rg, 'Microsoft.Network/virtualNetworks/subnets', 'vnet1', 'web')`
 * → `/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet1/subnets/web`.
 */
export function resourceId(subscriptionId: string, resourceGroupName: string, type: string, ...names: string[]): ArmId {
  const [namespace, ...typeSegments] = type.split('/')
  if (!namespace || typeSegments.length === 0 || typeSegments.length !== names.length) {
    throw new Error(`resourceId: type '${type}' needs exactly ${typeSegments.length} name(s), got ${names.length}`)
  }
  const path = typeSegments.map((segment, i) => `${segment}/${names[i] ?? ''}`).join('/')
  return `${resourceGroupId(subscriptionId, resourceGroupName)}/providers/${namespace}/${path}`
}

export interface ParsedResourceId {
  subscriptionId: string
  resourceGroupName: string
  /** Full type, e.g. `Microsoft.Network/networkSecurityGroups/securityRules`. Null for a resource group ID. */
  type: string | null
  /** One name per type level (empty for a resource group ID). */
  names: string[]
}

/** Parses a resource group or resource ID. Null when the text isn't one. */
export function parseArmId(id: string): ParsedResourceId | null {
  const parts = id.split('/')
  if (parts[0] !== '' || parts[1]?.toLowerCase() !== 'subscriptions' || parts[3]?.toLowerCase() !== 'resourcegroups') return null
  const subscriptionId = parts[2] ?? ''
  const resourceGroupName = parts[4] ?? ''
  if (subscriptionId === '' || resourceGroupName === '') return null
  if (parts.length === 5) return { subscriptionId, resourceGroupName, type: null, names: [] }

  if (parts[5]?.toLowerCase() !== 'providers') return null
  const namespace = parts[6] ?? ''
  const rest = parts.slice(7)
  if (namespace === '' || rest.length === 0 || rest.length % 2 !== 0 || rest.some(p => p === '')) return null
  const typeSegments = rest.filter((_, i) => i % 2 === 0)
  const names = rest.filter((_, i) => i % 2 === 1)
  return { subscriptionId, resourceGroupName, type: [namespace, ...typeSegments].join('/'), names }
}

/** The parent of a child resource ID, or null for a top-level resource or a resource group. */
export function parentResourceId(id: ArmId): ArmId | null {
  const parsed = parseArmId(id)
  if (!parsed?.type || parsed.names.length < 2) return null
  return id.split('/').slice(0, -2).join('/')
}
