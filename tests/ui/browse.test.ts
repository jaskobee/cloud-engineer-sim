import { describe, expect, it } from 'vitest'
import { azure } from '../../src/engine/index.ts'
import { browseRows } from '../../src/ui/portal/browse.ts'
import { NSG_DATA, NSG_GAME, pixelForge, RG, start, SUB } from '../engine/azure/fixtures.ts'

describe('service lists (PORTAL-5)', () => {
  const world = pixelForge()

  it('lists only resources of the type, sorted by name, with resource group, location and subscription', () => {
    const rows = browseRows(azure.NSG_TYPE, world)
    expect(rows.map(r => r.id)).toEqual([NSG_DATA, NSG_GAME])
    expect(rows[0]).toMatchObject({ name: 'nsg-snet-data', resourceGroup: RG, location: 'West Europe', state: 'Succeeded' })
    expect(rows[0]?.subscription).toBe(world.tenant.subscriptions[SUB]?.displayName)
  })

  it('lists resource groups', () => {
    expect(browseRows('resourceGroups', world).map(r => r.name)).toContain(RG)
  })

  it('shows a resource that is still being created', () => {
    const w = start(world, 'arm/networkSecurityGroups/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'nsg-new', location: 'westeurope' })
    expect(browseRows(azure.NSG_TYPE.toLowerCase(), w).find(r => r.name === 'nsg-new')?.state).toBe('Creating')
  })
})
