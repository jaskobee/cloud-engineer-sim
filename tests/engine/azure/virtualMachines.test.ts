import { describe, expect, it } from 'vitest'
import { azure, type World } from '../../../src/engine/index.ts'
import { expectRule, id, lastWrite, ok, refused, RG, SNET_GAME, SUB, withSubnets } from './fixtures.ts'

const NIC = id(azure.NIC_TYPE, 'nic-game-01')
const VM = id(azure.VM_TYPE, 'vm-game-01')
const vm = (over: Record<string, unknown> = {}) => ({
  subscriptionId: SUB, resourceGroupName: RG, name: 'vm-game-01', location: 'westeurope', vmSize: 'Standard_B2s_v2',
  image: 'Ubuntu2204', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops', networkInterfaceId: NIC, ...over,
})
const withNic = (): World => ok(withSubnets(), 'arm/networkInterfaces/write', {
  subscriptionId: SUB, resourceGroupName: RG, name: 'nic-game-01', location: 'westeurope', subnetId: SNET_GAME,
})

describe('virtual machines', () => {
  it('create a Linux VM with the ARM shape from the template reference (VM-9, VM-12, VM-18)', () => {
    const w = ok(withNic(), 'arm/virtualMachines/write', vm())
    const created = azure.getResource(w, VM)
    expect(created?.properties).toEqual({
      hardwareProfile: { vmSize: 'Standard_B2s_v2' },
      storageProfile: {
        imageReference: { publisher: 'Canonical', offer: '0001-com-ubuntu-server-jammy', sku: '22_04-lts-gen2', version: 'latest' },
        osDisk: {
          name: 'vm-game-01_OsDisk_1', createOption: 'FromImage', osType: 'Linux', deleteOption: 'Delete',
          managedDisk: { id: id(azure.DISK_TYPE, 'vm-game-01_OsDisk_1'), storageAccountType: 'StandardSSD_LRS' },
        },
      },
      osProfile: {
        computerName: 'vm-game-01',
        adminUsername: 'pixelops',
        linuxConfiguration: {
          disablePasswordAuthentication: true,
          ssh: { publicKeys: [{ path: '/home/pixelops/.ssh/authorized_keys', keyData: '(simulated key pair, not a real key)' }] },
        },
      },
      networkProfile: { networkInterfaces: [{ id: NIC, properties: { primary: true } }] },
    })
    expect(lastWrite(w).map(e => e.operationName)).toEqual(Array(2).fill('Microsoft.Compute/virtualMachines/write'))
  })

  it('also create the managed OS disk, and are running once created (VM-15s, VM-16s, VM-7)', () => {
    const w = ok(withNic(), 'arm/virtualMachines/write', vm())
    expect(azure.getResource(w, id(azure.DISK_TYPE, 'vm-game-01_OsDisk_1'))).toMatchObject({
      type: 'Microsoft.Compute/disks', sku: { name: 'StandardSSD_LRS' }, properties: { managedBy: VM },
    })
    expect(azure.powerStateOf(w, VM)).toBe('running')
    expect(azure.vmsUsingNic(w, NIC).map(v => v.name)).toEqual(['vm-game-01'])
  })

  it('refuse names with symbols or a trailing hyphen (VM-1, VM-1s)', () => {
    for (const name of ['vm.game', 'vm_game', 'vm game', 'vm-', 'x'.repeat(65)]) expectRule(refused(withNic(), 'arm/virtualMachines/write', vm({ name })), 'VM-1')
    ok(withNic(), 'arm/virtualMachines/write', vm({ name: 'VM-Game-01' }))
  })

  it('refuse reserved or overlong admin usernames (VM-2)', () => {
    for (const adminUsername of ['admin', 'root', 'Administrator', 'test', '', 'x'.repeat(33)]) {
      expectRule(refused(withNic(), 'arm/virtualMachines/write', vm({ adminUsername })), 'VM-2')
    }
  })

  it('refuse Premium SSD v2 and Ultra Disk as OS disks (VM-11) and do not model other SKUs (VM-11s)', () => {
    expectRule(refused(withNic(), 'arm/virtualMachines/write', vm({ osDiskType: 'PremiumV2_LRS' })), 'VM-11')
    expectRule(refused(withNic(), 'arm/virtualMachines/write', vm({ osDiskType: 'UltraSSD_LRS' })), 'VM-11')
    expectRule(refused(withNic(), 'arm/virtualMachines/write', vm({ osDiskType: 'Premium_ZRS' })), 'VM-11s', 'not-modelled')
    for (const osDiskType of ['Premium_LRS', 'StandardSSD_LRS', 'Standard_LRS']) ok(withNic(), 'arm/virtualMachines/write', vm({ osDiskType }))
  })

  it('only offer the modelled sizes and image (VM-13s, VM-12s)', () => {
    expectRule(refused(withNic(), 'arm/virtualMachines/write', vm({ vmSize: 'Standard_D2s_v5' })), 'VM-13s', 'not-modelled')
    expectRule(refused(withNic(), 'arm/virtualMachines/write', vm({ image: 'Ubuntu2404' })), 'VM-12s', 'not-modelled')
  })

  it('need a NIC in the same region and subscription (NIC-1) that no other VM uses (VM-17u)', () => {
    expectRule(refused(withNic(), 'arm/virtualMachines/write', vm({ location: 'northeurope' })), 'NIC-1')
    const w = ok(withNic(), 'arm/virtualMachines/write', vm())
    expectRule(refused(w, 'arm/virtualMachines/write', vm({ name: 'vm-game-02' })), 'VM-17u', 'not-modelled')
    expect(refused(withSubnets(), 'arm/virtualMachines/write', vm()).kind).toBe('invalid')
  })

  it('do not model changing an existing VM (ARM-4u)', () => {
    const w = ok(withNic(), 'arm/virtualMachines/write', vm())
    expectRule(refused(w, 'arm/virtualMachines/write', vm({ name: 'VM-GAME-01' })), 'ARM-4u', 'not-modelled')
  })
})
