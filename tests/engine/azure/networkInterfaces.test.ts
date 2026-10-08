import { describe, expect, it } from 'vitest'
import { azure, type World } from '../../../src/engine/index.ts'
import { expectRule, id, lastWrite, NSG_GAME, ok, refused, RG, SNET_DATA, SNET_GAME, SUB, withSubnets } from './fixtures.ts'

const pip = (name: string, over: Record<string, unknown> = {}) => ({
  subscriptionId: SUB, resourceGroupName: RG, name, location: 'westeurope',
  sku: { name: 'Standard', tier: 'Regional' }, publicIPAllocationMethod: 'Static', ...over,
})
const nic = (name: string, over: Record<string, unknown> = {}) => ({
  subscriptionId: SUB, resourceGroupName: RG, name, location: 'westeurope', subnetId: SNET_GAME, ...over,
})
const PIP_GAME = id(azure.PUBLIC_IP_TYPE, 'pip-game-01')
const NIC_GAME = id(azure.NIC_TYPE, 'nic-game-01')
const privateIp = (w: World, nicId: string) => azure.ipConfigurationsOf(azure.getResource(w, nicId)!)[0]?.properties.privateIPAddress

describe('public IP addresses', () => {
  it('are Standard, Regional, Static IPv4 with a made-up documentation address (PIP-6s, PIP-7s)', () => {
    let w = ok(withSubnets(), 'arm/publicIPAddresses/write', pip('pip-game-01'))
    w = ok(w, 'arm/publicIPAddresses/write', pip('pip-game-02'))
    const first = azure.getResource(w, PIP_GAME)
    expect(first).toMatchObject({ sku: { name: 'Standard', tier: 'Regional' }, properties: { publicIPAllocationMethod: 'Static', publicIPAddressVersion: 'IPv4', ipAddress: '198.51.100.10' } })
    expect(azure.getResource(w, id(azure.PUBLIC_IP_TYPE, 'pip-game-02'))?.properties.ipAddress).toBe('198.51.100.11')
    expect(lastWrite(w).map(e => e.operationName)).toEqual(Array(2).fill('Microsoft.Network/publicIPAddresses/write'))
  })

  it('refuse the retired Basic SKU (PIP-2) and do not model other SKUs, tiers, Dynamic or IPv6 (PIP-6s, PIP-5u)', () => {
    expectRule(refused(withSubnets(), 'arm/publicIPAddresses/write', pip('p', { sku: { name: 'Basic' } })), 'PIP-2')
    expectRule(refused(withSubnets(), 'arm/publicIPAddresses/write', pip('p', { sku: { name: 'StandardV2' } })), 'PIP-6s', 'not-modelled')
    expectRule(refused(withSubnets(), 'arm/publicIPAddresses/write', pip('p', { sku: { name: 'Standard', tier: 'Global' } })), 'PIP-6s', 'not-modelled')
    expectRule(refused(withSubnets(), 'arm/publicIPAddresses/write', pip('p', { publicIPAllocationMethod: 'Dynamic' })), 'PIP-5u', 'not-modelled')
    expectRule(refused(withSubnets(), 'arm/publicIPAddresses/write', pip('p', { publicIPAddressVersion: 'IPv6' })), 'PIP-6s', 'not-modelled')
    expectRule(refused(withSubnets(), 'arm/publicIPAddresses/write', pip('p', { publicIPAllocationMethod: 'Sometimes' })), 'PIP-6')
  })

  it('refuse invalid names (PIP-3) and do not model changing an existing one (ARM-4u)', () => {
    expectRule(refused(withSubnets(), 'arm/publicIPAddresses/write', pip('pip-')), 'PIP-3')
    const w = ok(withSubnets(), 'arm/publicIPAddresses/write', pip('pip-game-01'))
    expectRule(refused(w, 'arm/publicIPAddresses/write', pip('PIP-GAME-01')), 'ARM-4u', 'not-modelled')
  })
})

describe('network interfaces', () => {
  it('get the lowest free address after the four reserved ones when dynamic (PRIV-1, PRIV-1s, SUB-2)', () => {
    let w = ok(withSubnets(), 'arm/networkInterfaces/write', nic('nic-game-01'))
    w = ok(w, 'arm/networkInterfaces/write', nic('nic-game-02'))
    expect(privateIp(w, NIC_GAME)).toBe('10.40.1.4')
    expect(privateIp(w, id(azure.NIC_TYPE, 'nic-game-02'))).toBe('10.40.1.5')
    const config = azure.ipConfigurationsOf(azure.getResource(w, NIC_GAME)!)[0]
    expect(config).toEqual({
      name: 'ipconfig1',
      properties: { primary: true, privateIPAllocationMethod: 'Dynamic', privateIPAddress: '10.40.1.4', privateIPAddressVersion: 'IPv4', subnet: { id: SNET_GAME } },
    })
    expect(lastWrite(w).map(e => e.operationName)).toEqual(Array(2).fill('Microsoft.Network/networkInterfaces/write'))
  })

  it('take any free, unreserved address in the subnet when static (PRIV-2, SUB-2)', () => {
    const w = ok(withSubnets(), 'arm/networkInterfaces/write', nic('nic-db-01', { subnetId: SNET_DATA, privateIPAllocationMethod: 'Static', privateIPAddress: '10.40.2.10' }))
    expect(privateIp(w, id(azure.NIC_TYPE, 'nic-db-01'))).toBe('10.40.2.10')
    const staticNic = (address: string) => nic('nic-x', { subnetId: SNET_DATA, privateIPAllocationMethod: 'Static', privateIPAddress: address })
    for (const reserved of ['10.40.2.0', '10.40.2.1', '10.40.2.3', '10.40.2.255']) {
      expectRule(refused(w, 'arm/networkInterfaces/write', staticNic(reserved)), 'SUB-2')
    }
    expectRule(refused(w, 'arm/networkInterfaces/write', staticNic('10.40.1.10')), 'PRIV-2')
    expectRule(refused(w, 'arm/networkInterfaces/write', staticNic('10.40.2.10')), 'PRIV-2')
    expectRule(refused(w, 'arm/networkInterfaces/write', nic('nic-x', { subnetId: SNET_DATA, privateIPAllocationMethod: 'Static' })), 'PRIV-2')
  })

  it('a dynamic NIC never takes a static NIC\'s address', () => {
    let w = ok(withSubnets(), 'arm/networkInterfaces/write', nic('nic-static', { privateIPAllocationMethod: 'Static', privateIPAddress: '10.40.1.4' }))
    w = ok(w, 'arm/networkInterfaces/write', nic('nic-dynamic'))
    expect(privateIp(w, id(azure.NIC_TYPE, 'nic-dynamic'))).toBe('10.40.1.5')
  })

  it('must use a VNet in its own region and subscription (VNET-6, NIC-1)', () => {
    expectRule(refused(withSubnets(), 'arm/networkInterfaces/write', nic('nic-neu', { location: 'northeurope' })), 'VNET-6')
  })

  it('associate a public IP and an NSG, and can change them later (PIP-8, NSG-12, NIC-8s)', () => {
    let w = ok(withSubnets(), 'arm/publicIPAddresses/write', pip('pip-game-01'))
    w = ok(w, 'arm/networkInterfaces/write', nic('nic-game-01', { publicIPAddressId: PIP_GAME, networkSecurityGroupId: NSG_GAME }))
    const created = azure.getResource(w, NIC_GAME)!
    expect(azure.ipConfigurationsOf(created)[0]?.properties.publicIPAddress).toEqual({ id: PIP_GAME })
    expect(azure.nicNsgId(created)).toBe(NSG_GAME)

    w = ok(w, 'arm/networkInterfaces/write', nic('nic-game-01', { publicIPAddressId: null, networkSecurityGroupId: null }))
    const updated = azure.getResource(w, NIC_GAME)!
    expect(azure.ipConfigurationsOf(updated)[0]?.properties.publicIPAddress).toBeUndefined()
    expect(azure.nicNsgId(updated)).toBeNull()
    expect(privateIp(w, NIC_GAME)).toBe('10.40.1.4')
  })

  it('do not model sharing a public IP or using one from another region (PIP-9u)', () => {
    let w = ok(withSubnets(), 'arm/publicIPAddresses/write', pip('pip-game-01'))
    w = ok(w, 'arm/networkInterfaces/write', nic('nic-game-01', { publicIPAddressId: PIP_GAME }))
    expectRule(refused(w, 'arm/networkInterfaces/write', nic('nic-game-02', { publicIPAddressId: PIP_GAME })), 'PIP-9u', 'not-modelled')
    w = ok(w, 'arm/publicIPAddresses/write', pip('pip-neu', { location: 'northeurope' }))
    expectRule(refused(w, 'arm/networkInterfaces/write', nic('nic-game-03', { publicIPAddressId: id(azure.PUBLIC_IP_TYPE, 'pip-neu') })), 'PIP-9u', 'not-modelled')
  })

  it('do not model moving an existing NIC to another subnet or address (NIC-8s)', () => {
    const w = ok(withSubnets(), 'arm/networkInterfaces/write', nic('nic-game-01'))
    expectRule(refused(w, 'arm/networkInterfaces/write', nic('nic-game-01', { subnetId: SNET_DATA })), 'NIC-8s', 'not-modelled')
    expectRule(refused(w, 'arm/networkInterfaces/write', nic('nic-game-01', { privateIPAllocationMethod: 'Static', privateIPAddress: '10.40.1.20' })), 'NIC-8s', 'not-modelled')
  })

  it('refuse invalid names (NIC-6) and a missing subnet', () => {
    expectRule(refused(withSubnets(), 'arm/networkInterfaces/write', nic('nic game')), 'NIC-6')
    expect(refused(withSubnets(), 'arm/networkInterfaces/write', nic('nic-x', { subnetId: `${SNET_GAME}-nope` })).kind).toBe('invalid')
  })

  it('a /29 subnet has three usable addresses, then it is full (SUB-2, PRIV-1s)', () => {
    let w = ok(withSubnets(), 'arm/subnets/write', { virtualNetworkId: SNET_GAME.replace('/subnets/snet-game', ''), name: 'snet-tiny', addressPrefix: '10.40.9.0/29' })
    const tiny = SNET_GAME.replace('snet-game', 'snet-tiny')
    for (const n of [1, 2, 3]) w = ok(w, 'arm/networkInterfaces/write', nic(`nic-tiny-${n}`, { subnetId: tiny }))
    expect([1, 2, 3].map(n => privateIp(w, id(azure.NIC_TYPE, `nic-tiny-${n}`)))).toEqual(['10.40.9.4', '10.40.9.5', '10.40.9.6'])
    expectRule(refused(w, 'arm/networkInterfaces/write', nic('nic-tiny-4', { subnetId: tiny })), 'PRIV-1s', 'not-modelled')
  })
})
