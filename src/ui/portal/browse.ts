import { azure, type ArmId, type World } from '../../engine/index.ts'

/** One row of a service list (PORTAL-5). */
export interface BrowseRow {
  id: ArmId
  name: string
  type: string
  resourceGroup: string
  location: string
  subscription: string
  /** Provisioning state: `Creating`, `Succeeded`, … (ARM-1s). */
  state: string
}

const region = (location: string) => (location === 'global' ? 'Global' : azure.regionDisplayName(location))

/** The rows of a service list: `resourceGroups`, or top-level resources of one ARM type, by name. */
export function browseRows(type: string, world: World): BrowseRow[] {
  const { tenant } = world
  const subscription = (id: string) => tenant.subscriptions[id]?.displayName ?? id
  if (type.toLowerCase() === 'resourcegroups') {
    return Object.values(tenant.resourceGroups)
      .map(g => {
        const p = azure.parseArmId(g.id)
        return { id: g.id, name: g.name, type: 'Resource group', resourceGroup: g.name, location: region(g.location), subscription: subscription(p?.subscriptionId ?? ''), state: 'Succeeded' }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }
  return Object.values(tenant.resources)
    .filter(r => r.type.toLowerCase() === type.toLowerCase() && azure.parentResourceId(r.id) === null)
    .map(r => {
      const p = azure.parseArmId(r.id)
      return { id: r.id, name: r.name, type: r.type, resourceGroup: p?.resourceGroupName ?? '', location: region(r.location), subscription: subscription(p?.subscriptionId ?? ''), state: r.provisioningState }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
