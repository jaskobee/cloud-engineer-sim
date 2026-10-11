import { describe, expect, it } from 'vitest'
import { azure, DEPLOYMENT_COMMAND, dispatch, type World } from '../../src/engine/index.ts'
import { MISSIONS, registryFor, startMission } from '../../src/missions/index.ts'
import { PLAYER_PRINCIPAL } from '../../src/store/gameStore.ts'
import { createdByLabel } from '../../src/ui/portal/callers.ts'
import { settle } from '../engine/azure/fixtures.ts'

const def = MISSIONS['pixelforge-launch-day']!
const registry = registryFor(def)
const SUB = def.subscription.subscriptionId

function played(): World {
  let w = startMission(def, 'created-by', registry)
  const act = (type: string, payload: unknown) => {
    const r = dispatch(w, registry, { type, caller: PLAYER_PRINCIPAL, payload })
    if (r.outcome.status !== 'accepted') throw new Error(JSON.stringify(r.outcome))
    w = settle(r.world)
  }
  const base = { subscriptionId: SUB, resourceGroupName: 'rg-prod', location: 'westeurope' }
  act('arm/resourceGroups/write', { subscriptionId: SUB, name: 'rg-prod', location: 'westeurope' })
  act('arm/virtualNetworks/write', { ...base, name: 'vnet-prod', addressPrefixes: ['10.40.0.0/16'] })
  const vnet = azure.resourceId(SUB, 'rg-prod', azure.VNET_TYPE, 'vnet-prod')
  act('arm/subnets/write', { virtualNetworkId: vnet, name: 'snet-game', addressPrefix: '10.40.1.0/24' })
  act(DEPLOYMENT_COMMAND, {
    resources: [
      { type: 'arm/networkInterfaces/write', payload: { ...base, name: 'vm-a-nic', subnetId: `${vnet}/subnets/snet-game`, privateIPAllocationMethod: 'Dynamic', publicIPAddressId: null, networkSecurityGroupId: null } },
      { type: 'arm/virtualMachines/write', payload: { ...base, name: 'vm-a', vmSize: 'Standard_B2s_v2', image: 'Ubuntu2204', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops', networkInterfaceId: azure.resourceId(SUB, 'rg-prod', azure.NIC_TYPE, 'vm-a-nic') } },
    ],
  })
  return w
}

describe('Created by (PORTAL-21s): derived from the activity log', () => {
  const w = played()
  it('names the client contact who made the existing resources, and "You" for the player\'s', () => {
    expect(createdByLabel(azure.resourceGroupId(SUB, 'rg-pixelforge-test'), w)).toBe('Mia Becker')
    expect(createdByLabel(azure.resourceId(SUB, 'rg-prod', azure.VNET_TYPE, 'vnet-prod'), w)).toBe('You')
  })

  it('a resource created inside a multi-resource deployment has its own creator', () => {
    expect(createdByLabel(azure.resourceId(SUB, 'rg-prod', azure.NIC_TYPE, 'vm-a-nic'), w)).toBe('You')
  })

  it('the OS disk a VM write creates is never logged on its own (VM-15s)', () => {
    expect(createdByLabel(azure.resourceId(SUB, 'rg-prod', azure.DISK_TYPE, 'vm-a_OsDisk_1'), w)).toBe('Not in the activity log')
  })
})
