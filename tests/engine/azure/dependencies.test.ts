import { describe, expect, it } from 'vitest'
import { azure, type World } from '../../../src/engine/index.ts'
import { id, NSG_GAME, ok, RG, SNET_GAME, SUB, VNET, withSubnets } from './fixtures.ts'

const NIC = id(azure.NIC_TYPE, 'nic-game-01')
const PIP = id(azure.PUBLIC_IP_TYPE, 'pip-game-01')
const VM = id(azure.VM_TYPE, 'vm-game-01')
const DISK = id(azure.DISK_TYPE, 'vm-game-01_OsDisk_1')
const RULE = `${NSG_GAME}/securityRules/Allow-HTTPS`

/** The PixelForge game server: subnet NSG, a NIC with a public IP and its own NSG, a VM with its disk. */
function gameServer(): World {
  let w = withSubnets()
  w = ok(w, 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.1.0/24', networkSecurityGroupId: NSG_GAME })
  w = ok(w, 'arm/securityRules/write', {
    networkSecurityGroupId: NSG_GAME, name: 'Allow-HTTPS',
    properties: { priority: 200, direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefix: 'Internet', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '443' },
  })
  w = ok(w, 'arm/publicIPAddresses/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'pip-game-01', location: 'westeurope', sku: { name: 'Standard' }, publicIPAllocationMethod: 'Static' })
  w = ok(w, 'arm/networkInterfaces/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'nic-game-01', location: 'westeurope', subnetId: SNET_GAME, publicIPAddressId: PIP, networkSecurityGroupId: NSG_GAME })
  return ok(w, 'arm/virtualMachines/write', {
    subscriptionId: SUB, resourceGroupName: RG, name: 'vm-game-01', location: 'westeurope', vmSize: 'Standard_B2s_v2',
    image: 'Ubuntu2204', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops', networkInterfaceId: NIC,
  })
}

const pairs = (deps: azure.Dependency[]) => deps.map(d => `${d.kind} → ${d.to.split('/').at(-1)}`)

describe('dependenciesOf (derived from stored references, CLAUDE.md rule 6)', () => {
  it('a subnet depends on its VNet and its NSG (SUB-9s, NSG-12)', () => {
    expect(pairs(azure.dependenciesOf(gameServer(), SNET_GAME))).toEqual(['parent → vnet-pixelforge', 'networkSecurityGroup → nsg-snet-game'])
  })

  it('a security rule depends on its NSG (NSG-13s)', () => {
    expect(pairs(azure.dependenciesOf(gameServer(), RULE))).toEqual(['parent → nsg-snet-game'])
  })

  it('a NIC depends on its subnet, public IP and NSG (NIC-2, PIP-8, NSG-12)', () => {
    expect(pairs(azure.dependenciesOf(gameServer(), NIC))).toEqual(['subnet → snet-game', 'publicIPAddress → pip-game-01', 'networkSecurityGroup → nsg-snet-game'])
  })

  it('a VM depends on its NIC and its OS disk (VM-15s, VM-16s)', () => {
    expect(pairs(azure.dependenciesOf(gameServer(), VM))).toEqual(['networkInterface → nic-game-01', 'osDisk → vm-game-01_OsDisk_1'])
  })

  it('resources without references have none, and unknown IDs give an empty list', () => {
    const w = gameServer()
    expect(azure.dependenciesOf(w, PIP)).toEqual([])
    expect(azure.dependenciesOf(w, DISK)).toEqual([])
    expect(azure.dependenciesOf(w, `${VNET}/subnets/nope`)).toEqual([])
  })

  it('dependentsOf is the reverse: who would break if the NSG went away', () => {
    expect(pairs(azure.dependentsOf(gameServer(), NSG_GAME)).sort()).toEqual(
      ['networkSecurityGroup → nsg-snet-game', 'networkSecurityGroup → nsg-snet-game', 'parent → nsg-snet-game'],
    )
    expect(azure.dependentsOf(gameServer(), NSG_GAME).map(d => d.from.split('/').at(-1)).sort()).toEqual(['Allow-HTTPS', 'nic-game-01', 'snet-game'])
  })

  it('allDependencies is stable and every edge points at an existing resource', () => {
    const w = gameServer()
    const all = azure.allDependencies(w)
    expect(all).toEqual(azure.allDependencies(w))
    for (const d of all) expect(azure.getResource(w, d.to)).toBeDefined()
  })
})
