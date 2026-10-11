import { describe, expect, it } from 'vitest'
import { azure } from '../../src/engine/index.ts'
import { essentialsRows, propertyRows } from '../../src/ui/portal/resourceFacts.ts'
import { NIC_GAME, NSG_GAME, pixelForge, PIP_GAME, rgId, RG, SUB, VM_GAME, VNET } from '../engine/azure/fixtures.ts'

const world = pixelForge()
const labels = (rows: [string, string][]) => rows.map(r => r[0])

describe('Essentials (PORTAL-4, PORTAL-4s)', () => {
  it('starts with resource group, location, subscription, subscription ID and tags, then type properties', () => {
    const vnet = azure.getResource(world, VNET)!
    const rows = essentialsRows(vnet, world)
    expect(labels(rows).slice(0, 5)).toEqual(['Resource group', 'Location', 'Subscription', 'Subscription ID', 'Tags'])
    expect(rows[0]?.[1]).toBe(RG)
    expect(rows[1]?.[1]).toBe('West Europe')
    expect(rows[3]?.[1]).toBe(SUB)
    expect(rows[4]?.[1]).toBe('None')
    expect(rows[5]).toEqual(['Address space', '10.40.0.0/16'])
  })

  it('a resource group has its own Essentials', () => {
    const rows = essentialsRows(world.tenant.resourceGroups[azure.armKey(rgId())]!, world)
    expect(labels(rows)).toEqual(['Subscription', 'Subscription ID', 'Location', 'Tags', 'Deployments'])
  })

  it('a VM shows its network details from the NIC, a public IP its made-up address', () => {
    const vm = Object.fromEntries(propertyRows(azure.getResource(world, VM_GAME)!, world))
    expect(vm['Network interface']).toBe('nic-game-01')
    expect(vm['Private IP address']).toBe('10.40.1.4')
    const pip = Object.fromEntries(propertyRows(azure.getResource(world, PIP_GAME)!, world))
    expect(pip['IP address']).toMatch(/\(made up\)$/)
    expect(pip['Associated with']).toBe('nic-game-01')
    const nic = Object.fromEntries(propertyRows(azure.getResource(world, NIC_GAME)!, world))
    expect(nic['Network security group']).toBeDefined()
    const nsg = Object.fromEntries(propertyRows(azure.getResource(world, NSG_GAME)!, world))
    expect(nsg['Subnets']).toBe('snet-game')
  })
})
