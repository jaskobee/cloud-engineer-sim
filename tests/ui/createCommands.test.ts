import { describe, expect, it } from 'vitest'
import { azure } from '../../src/engine/index.ts'
import { buildCommands, canCreate, reviewKey, targetIdOf } from '../../src/ui/portal/create/commands.ts'
import { NIC_GAME, RG, SNET_GAME, SUB } from '../engine/azure/fixtures.ts'

const basics = { subscriptionId: SUB, resourceGroupName: RG, newResourceGroup: '', name: 'x', location: 'westeurope' }

describe('create wizards build the same commands as before (PORTAL-6, PORTAL-7)', () => {
  it('virtual network: Basics + IP Addresses', () => {
    expect(buildCommands('virtualNetwork', { ...basics, name: 'vnet-a', addressSpace: '10.60.0.0/16' })).toEqual([
      { type: 'arm/virtualNetworks/write', payload: { subscriptionId: SUB, resourceGroupName: RG, name: 'vnet-a', location: 'westeurope', addressPrefixes: ['10.60.0.0/16'] } },
    ])
    expect(targetIdOf('virtualNetwork', { ...basics, name: 'vnet-a' })).toBe(azure.resourceId(SUB, RG, azure.VNET_TYPE, 'vnet-a'))
  })

  it('Create new resource group: the group is written first, then the resource', () => {
    const cmds = buildCommands('networkSecurityGroup', { ...basics, resourceGroupName: 'rg-new', newResourceGroup: 'true', name: 'nsg-a' })
    expect(cmds.map(c => c.type)).toEqual(['arm/resourceGroups/write', 'arm/networkSecurityGroups/write'])
    expect(cmds[0]?.payload).toEqual({ subscriptionId: SUB, name: 'rg-new', location: 'westeurope' })
  })

  it('resource group, public IP, workspace, Application Insights', () => {
    expect(buildCommands('resourceGroup', { subscriptionId: SUB, name: 'rg-b', location: 'northeurope' })).toEqual([
      { type: 'arm/resourceGroups/write', payload: { subscriptionId: SUB, name: 'rg-b', location: 'northeurope' } },
    ])
    expect(targetIdOf('resourceGroup', { subscriptionId: SUB, name: 'rg-b' })).toBe(azure.resourceGroupId(SUB, 'rg-b'))
    expect(buildCommands('publicIp', { ...basics, name: 'pip-a' })[0]?.payload).toEqual({
      subscriptionId: SUB, resourceGroupName: RG, name: 'pip-a', location: 'westeurope',
      sku: { name: 'Standard', tier: 'Regional' }, publicIPAllocationMethod: 'Static', publicIPAddressVersion: 'IPv4',
    })
    expect(buildCommands('workspace', { ...basics, name: 'log-a' })[0]).toEqual({ type: 'arm/workspaces/write', payload: { subscriptionId: SUB, resourceGroupName: RG, name: 'log-a', location: 'westeurope' } })
    expect(buildCommands('component', { ...basics, name: 'appi-a', workspaceId: 'ws' })[0]?.payload).toMatchObject({ workspaceResourceId: 'ws' })
  })

  it('network interface: one screen, no public IP or NSG at create (PORTAL-7)', () => {
    expect(buildCommands('networkInterface', { ...basics, name: 'nic-a', subnetId: SNET_GAME, privateIPAllocationMethod: 'Static', privateIPAddress: '10.40.1.10' })[0]).toEqual({
      type: 'arm/networkInterfaces/write',
      payload: {
        subscriptionId: SUB, resourceGroupName: RG, name: 'nic-a', location: 'westeurope', subnetId: SNET_GAME,
        privateIPAllocationMethod: 'Static', privateIPAddress: '10.40.1.10', publicIPAddressId: null, networkSecurityGroupId: null,
      },
    })
    expect(buildCommands('networkInterface', { ...basics, name: 'nic-a', subnetId: SNET_GAME, privateIPAllocationMethod: 'Dynamic', privateIPAddress: '10.40.1.10' })[0]?.payload).not.toHaveProperty('privateIPAddress')
  })

  it('virtual machine: Basics, Disks, Networking', () => {
    expect(buildCommands('virtualMachine', { ...basics, name: 'vm-a', vmSize: 'Standard_B2s_v2', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops', networkInterfaceId: NIC_GAME })[0]).toEqual({
      type: 'arm/virtualMachines/write',
      payload: {
        subscriptionId: SUB, resourceGroupName: RG, name: 'vm-a', location: 'westeurope', vmSize: 'Standard_B2s_v2', image: 'Ubuntu2204',
        osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops', networkInterfaceId: NIC_GAME,
      },
    })
  })

  it('review then edit invalidates: Create is only allowed for the exact commands that passed validation', () => {
    const a = buildCommands('networkSecurityGroup', { ...basics, name: 'nsg-a' })
    const b = buildCommands('networkSecurityGroup', { ...basics, name: 'nsg-b' })
    const passed = { key: reviewKey(a), refusal: null }
    expect(canCreate(passed, a)).toBe(true)
    expect(canCreate(passed, b)).toBe(false)
    expect(canCreate(null, a)).toBe(false)
    expect(canCreate({ key: reviewKey(a), refusal: { kind: 'invalid', code: 'x', message: 'no' } }, a)).toBe(false)
  })
})
