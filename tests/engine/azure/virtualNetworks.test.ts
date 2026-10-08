import { describe, expect, it } from 'vitest'
import { azure } from '../../../src/engine/index.ts'
import {
  emptyWorld, expectRule, id, lastWrite, NSG_GAME, ok, refused, RG, SNET_GAME, SUB, VNET, withSubnets, withVnet,
} from './fixtures.ts'

const vnet = (over: Record<string, unknown> = {}) => ({
  subscriptionId: SUB, resourceGroupName: RG, name: 'vnet-new', location: 'westeurope', addressPrefixes: ['10.50.0.0/16'], ...over,
})
const subnet = (over: Record<string, unknown> = {}) => ({ virtualNetworkId: VNET, name: 'snet-new', addressPrefix: '10.40.9.0/24', ...over })
const rgWorld = () => ok(emptyWorld(), 'arm/resourceGroups/write', { subscriptionId: SUB, name: RG, location: 'westeurope' })

describe('virtual networks', () => {
  it('creates a VNet with its address space and logs Microsoft.Network/virtualNetworks/write (ARM-3s, VNET-7)', () => {
    const w = withVnet()
    const v = azure.getResource(w, VNET)
    expect(v).toMatchObject({ type: 'Microsoft.Network/virtualNetworks', location: 'westeurope', provisioningState: 'Succeeded' })
    expect(v?.properties).toEqual({ addressSpace: { addressPrefixes: ['10.40.0.0/16'] } })
    expect(lastWrite(w).map(e => e.operationName)).toEqual(['Microsoft.Network/virtualNetworks/write', 'Microsoft.Network/virtualNetworks/write'])
  })

  it('accepts all four recommended private ranges (VNET-2)', () => {
    for (const p of ['10.0.0.0/8', '172.16.0.0/12', '192.168.10.0/24', '100.64.0.0/16']) {
      ok(rgWorld(), 'arm/virtualNetworks/write', vnet({ addressPrefixes: [p] }))
    }
  })

  it('refuses invalid names (VNET-5)', () => {
    for (const name of ['v', 'vnet-', '-vnet', 'vnet!', 'x'.repeat(65)]) {
      expectRule(refused(rgWorld(), 'arm/virtualNetworks/write', vnet({ name })), 'VNET-5')
    }
    ok(rgWorld(), 'arm/virtualNetworks/write', vnet({ name: 'vnet_' }))
  })

  it('refuses blocks that are not CIDR (VNET-7), blocked ranges (VNET-3) and unmodelled ranges (VNET-2s)', () => {
    expectRule(refused(rgWorld(), 'arm/virtualNetworks/write', vnet({ addressPrefixes: [] })), 'VNET-7')
    expectRule(refused(rgWorld(), 'arm/virtualNetworks/write', vnet({ addressPrefixes: ['10.0.0.0'] })), 'VNET-7')
    expectRule(refused(rgWorld(), 'arm/virtualNetworks/write', vnet({ addressPrefixes: ['169.254.0.0/16'] })), 'VNET-3')
    expectRule(refused(rgWorld(), 'arm/virtualNetworks/write', vnet({ addressPrefixes: ['127.0.0.0/8'] })), 'VNET-3')
    expectRule(refused(rgWorld(), 'arm/virtualNetworks/write', vnet({ addressPrefixes: ['8.8.8.0/24'] })), 'VNET-2s', 'not-modelled')
  })

  it('does not guess about unaligned or overlapping blocks (VNET-8u)', () => {
    expectRule(refused(rgWorld(), 'arm/virtualNetworks/write', vnet({ addressPrefixes: ['10.50.1.5/24'] })), 'VNET-8u', 'not-modelled')
    expectRule(refused(rgWorld(), 'arm/virtualNetworks/write', vnet({ addressPrefixes: ['10.50.0.0/16', '10.50.4.0/24'] })), 'VNET-8u', 'not-modelled')
  })

  it('does not model changing an existing VNet (VNET-9u), matching names case-insensitively (NAME-6)', () => {
    expectRule(refused(withVnet(), 'arm/virtualNetworks/write', vnet({ name: 'VNET-PixelForge' })), 'VNET-9u', 'not-modelled')
  })

  it('needs the resource group and an offered region', () => {
    expect(refused(emptyWorld(), 'arm/virtualNetworks/write', vnet()).kind).toBe('invalid')
    expectRule(refused(rgWorld(), 'arm/virtualNetworks/write', vnet({ location: 'westus' })), 'REG-1', 'not-modelled')
  })
})

describe('subnets', () => {
  it('creates a private child resource and logs Microsoft.Network/virtualNetworks/subnets/write (SUB-7s, SUB-9s)', () => {
    const w = withSubnets()
    const s = azure.getResource(w, SNET_GAME)
    expect(s).toMatchObject({ type: 'Microsoft.Network/virtualNetworks/subnets', name: 'snet-game', location: 'westeurope' })
    expect(s?.properties).toEqual({ addressPrefix: '10.40.1.0/24', defaultOutboundAccess: false })
    expect(azure.subnetsOf(w, VNET).map(r => r.name).sort()).toEqual(['snet-data', 'snet-game'])
    const created = w.activityLog.filter(e => e.resourceId === SNET_GAME)
    expect(created.map(e => [e.status, e.operationName])).toEqual([
      ['Started', 'Microsoft.Network/virtualNetworks/subnets/write'],
      ['Succeeded', 'Microsoft.Network/virtualNetworks/subnets/write'],
    ])
  })

  it('accepts /29 to /2 only (SUB-1)', () => {
    ok(withVnet(), 'arm/subnets/write', subnet({ addressPrefix: '10.40.9.0/29' }))
    expectRule(refused(withVnet(), 'arm/subnets/write', subnet({ addressPrefix: '10.40.9.0/30' })), 'SUB-1')
  })

  it('must lie inside the VNet address space (SUB-4) and not overlap another subnet (SUB-3)', () => {
    expectRule(refused(withVnet(), 'arm/subnets/write', subnet({ addressPrefix: '10.41.0.0/24' })), 'SUB-4')
    expectRule(refused(withSubnets(), 'arm/subnets/write', subnet({ addressPrefix: '10.40.1.128/25' })), 'SUB-3')
    expectRule(refused(withSubnets(), 'arm/subnets/write', subnet({ addressPrefix: '10.40.0.0/16' })), 'SUB-3')
  })

  it('refuses invalid names (SUB-6) and a missing VNet', () => {
    expectRule(refused(withVnet(), 'arm/subnets/write', subnet({ name: 'snet game' })), 'SUB-6')
    expect(refused(withVnet(), 'arm/subnets/write', subnet({ virtualNetworkId: id(azure.VNET_TYPE, 'nope') })).kind).toBe('invalid')
  })

  it('associates and removes an NSG by updating the subnet (NSG-12)', () => {
    let w = ok(withSubnets(), 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.1.0/24', networkSecurityGroupId: NSG_GAME })
    expect(azure.getResource(w, SNET_GAME)?.properties.networkSecurityGroup).toEqual({ id: NSG_GAME })
    w = ok(w, 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.1.0/24', networkSecurityGroupId: null })
    expect(azure.getResource(w, SNET_GAME)?.properties.networkSecurityGroup).toBeUndefined()
  })

  it('does not model associating an NSG from another region (NSG-10)', () => {
    let w = withSubnets()
    w = ok(w, 'arm/networkSecurityGroups/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'nsg-neu', location: 'northeurope' })
    const refusal = refused(w, 'arm/subnets/write', {
      virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.1.0/24', networkSecurityGroupId: id(azure.NSG_TYPE, 'nsg-neu'),
    })
    expectRule(refusal, 'NSG-10', 'not-modelled')
  })

  it('can change its range only while nothing is deployed in it (SUB-5)', () => {
    let w = withSubnets()
    w = ok(w, 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-data', addressPrefix: '10.40.3.0/24' })
    w = ok(w, 'arm/networkInterfaces/write', {
      subscriptionId: SUB, resourceGroupName: RG, name: 'nic-game', location: 'westeurope', subnetId: SNET_GAME,
    })
    expectRule(refused(w, 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.4.0/24' }), 'SUB-5')
  })
})
