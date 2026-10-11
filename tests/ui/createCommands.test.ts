import { describe, expect, it } from 'vitest'
import { azure, DEPLOYMENT_COMMAND } from '../../src/engine/index.ts'
import { createGameStore } from '../../src/store/gameStore.ts'
import { buildCommands, canCreate, reviewKey, targetIdOf } from '../../src/ui/portal/create/commands.ts'
import { RG, SNET_GAME, SUB, VNET, withSubnets } from '../engine/azure/fixtures.ts'

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

  it('virtual machine: one deployment that creates the public IP, the network interface and the VM (PORTAL-20, ARM-15s)', () => {
    const vm = { ...basics, name: 'vm-a', vmSize: 'Standard_B2s_v2', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops', vnetId: VNET, subnetId: SNET_GAME, publicIp: 'new', publicIpName: '' }
    const pipId = azure.resourceId(SUB, RG, azure.PUBLIC_IP_TYPE, 'vm-a-ip')
    const nicId = azure.resourceId(SUB, RG, azure.NIC_TYPE, 'vm-a-nic')
    const place = { subscriptionId: SUB, resourceGroupName: RG, location: 'westeurope' }
    expect(buildCommands('virtualMachine', vm)).toEqual([{
      type: DEPLOYMENT_COMMAND,
      payload: {
        resources: [
          { type: 'arm/publicIPAddresses/write', payload: { ...place, name: 'vm-a-ip', sku: { name: 'Standard', tier: 'Regional' }, publicIPAllocationMethod: 'Static', publicIPAddressVersion: 'IPv4' } },
          { type: 'arm/networkInterfaces/write', payload: { ...place, name: 'vm-a-nic', subnetId: SNET_GAME, privateIPAllocationMethod: 'Dynamic', publicIPAddressId: pipId, networkSecurityGroupId: null } },
          { type: 'arm/virtualMachines/write', payload: { ...place, name: 'vm-a', vmSize: 'Standard_B2s_v2', image: 'Ubuntu2204', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops', networkInterfaceId: nicId } },
        ],
      },
    }])
    expect(targetIdOf('virtualMachine', vm)).toBe(azure.resourceId(SUB, RG, azure.VM_TYPE, 'vm-a'))
    // A name typed in the Create public IP address dialog.
    const named = buildCommands('virtualMachine', { ...vm, publicIpName: 'pip-game' })[0]?.payload as { resources: { payload: { name: string } }[] }
    expect(named.resources[0]?.payload.name).toBe('pip-game')
  })

  it('virtual machine with Public IP None: network interface without a public IP, then the VM', () => {
    const cmds = buildCommands('virtualMachine', { ...basics, name: 'vm-db', vnetId: VNET, subnetId: SNET_GAME, publicIp: 'none', vmSize: 'Standard_B2s_v2', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops' })
    const { resources } = cmds[0]?.payload as { resources: { type: string; payload: Record<string, unknown> }[] }
    expect(resources.map(r => r.type)).toEqual(['arm/networkInterfaces/write', 'arm/virtualMachines/write'])
    expect(resources[0]?.payload['publicIPAddressId']).toBeNull()
  })

  it('virtual machine with a new resource group: the group first, then the deployment', () => {
    const cmds = buildCommands('virtualMachine', { ...basics, resourceGroupName: 'rg-new', newResourceGroup: 'true', name: 'vm-a', subnetId: SNET_GAME, publicIp: 'new' })
    expect(cmds.map(c => c.type)).toEqual(['arm/resourceGroups/write', DEPLOYMENT_COMMAND])
  })

  it('virtual machine without a subnet: Review + create shows a refusal instead of creating anything', () => {
    const store = createGameStore({ world: withSubnets() })
    const cmds = buildCommands('virtualMachine', { ...basics, name: 'vm-a', subnetId: '', publicIp: 'new', vmSize: 'Standard_B2s_v2', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops' })
    expect(store.getState().checkAll(cmds)).not.toBeNull()
    const ok = buildCommands('virtualMachine', { ...basics, name: 'vm-a', subnetId: SNET_GAME, publicIp: 'new', vmSize: 'Standard_B2s_v2', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops' })
    expect(store.getState().checkAll(ok)).toBeNull()
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
