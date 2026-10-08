import { describe, expect, it } from 'vitest'
import { armKey, parentResourceId, parseArmId, resourceGroupId, resourceId, sameName } from '../../../src/engine/azure/armId.ts'

const SUB = '6b1c2a9e-0000-4000-8000-000000000001'

describe('ARM resource IDs (ARM-2)', () => {
  it('builds a resource group ID', () => {
    expect(resourceGroupId(SUB, 'rg-pixelforge-prod')).toBe(`/subscriptions/${SUB}/resourceGroups/rg-pixelforge-prod`)
  })

  it('builds top-level and child resource IDs', () => {
    expect(resourceId(SUB, 'rg', 'Microsoft.Network/virtualNetworks', 'vnet1'))
      .toBe(`/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet1`)
    expect(resourceId(SUB, 'rg', 'Microsoft.Network/networkSecurityGroups/securityRules', 'nsg1', 'Allow-HTTPS'))
      .toBe(`/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.Network/networkSecurityGroups/nsg1/securityRules/Allow-HTTPS`)
  })

  it('refuses a name count that does not match the type', () => {
    expect(() => resourceId(SUB, 'rg', 'Microsoft.Network/virtualNetworks/subnets', 'vnet1')).toThrow()
  })

  it('parses what it builds', () => {
    const id = resourceId(SUB, 'rg', 'Microsoft.Network/virtualNetworks/subnets', 'vnet1', 'web')
    expect(parseArmId(id)).toEqual({
      subscriptionId: SUB, resourceGroupName: 'rg', type: 'Microsoft.Network/virtualNetworks/subnets', names: ['vnet1', 'web'],
    })
    expect(parseArmId(resourceGroupId(SUB, 'rg'))).toEqual({ subscriptionId: SUB, resourceGroupName: 'rg', type: null, names: [] })
  })

  it('rejects text that is not an ARM ID', () => {
    for (const bad of ['', 'vnet1', `/subscriptions/${SUB}`, `/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.Network`,
      `/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks`]) {
      expect(parseArmId(bad)).toBeNull()
    }
  })

  it('finds the parent of a child resource', () => {
    const vnet = resourceId(SUB, 'rg', 'Microsoft.Network/virtualNetworks', 'vnet1')
    expect(parentResourceId(`${vnet}/subnets/web`)).toBe(vnet)
    expect(parentResourceId(vnet)).toBeNull()
  })
})

describe('case-insensitive names (NAME-6, ARM-2s)', () => {
  it('keys IDs case-insensitively and compares names case-insensitively', () => {
    expect(armKey('/subscriptions/X/resourceGroups/RG-Web')).toBe(armKey('/subscriptions/x/resourcegroups/rg-web'))
    expect(sameName('VNet-PixelForge', 'vnet-pixelforge')).toBe(true)
    expect(sameName('vnet-a', 'vnet-b')).toBe(false)
  })
})
