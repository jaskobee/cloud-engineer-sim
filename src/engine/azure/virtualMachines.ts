import type { System } from '../clock.ts'
import type { CommandHandler, Refusal } from '../commands.ts'
import type { ArmId, Resource, World } from '../world.ts'
import { armKey, parseArmId, resourceId, sameName } from './armId.ts'
import {
  armWrite, checkRegion, checkScope, firstRefusal, getResource, missing, notModelled, putResource, resourcesOfType, rule, stamp,
} from './common.ts'
import { NIC_TYPE } from './virtualNetworks.ts'

export const VM_TYPE = 'Microsoft.Compute/virtualMachines'
export const DISK_TYPE = 'Microsoft.Compute/disks'

/** Sizes the sim offers (VM-13, VM-13s). */
export const VM_SIZES = [
  { name: 'Standard_B2ts_v2', vCpus: 2, memoryGiB: 1 },
  { name: 'Standard_B2ls_v2', vCpus: 2, memoryGiB: 4 },
  { name: 'Standard_B2s_v2', vCpus: 2, memoryGiB: 8 },
] as const

/** The one image the sim offers (VM-12, VM-12s). */
export const IMAGES = {
  Ubuntu2204: { displayName: 'Ubuntu Server 22.04 LTS', publisher: 'Canonical', offer: '0001-com-ubuntu-server-jammy', sku: '22_04-lts-gen2', version: 'latest' },
} as const
export type ImageAlias = keyof typeof IMAGES

/** OS disk SKUs offered (VM-10, VM-11s), with their disk type names (VM-10). */
export const OS_DISK_TYPES = [
  { sku: 'Premium_LRS', displayName: 'Premium SSD' },
  { sku: 'StandardSSD_LRS', displayName: 'Standard SSD' },
  { sku: 'Standard_LRS', displayName: 'Standard HDD' },
] as const

/** Usernames Azure refuses for Linux VMs (VM-2). */
const RESERVED_USERNAMES = new Set([
  '1', '123', 'a', 'actuser', 'adm', 'admin', 'admin1', 'admin2', 'administrator', 'aspnet', 'backup', 'console', 'david',
  'guest', 'john', 'owner', 'root', 'server', 'sql', 'support_388945a0', 'support', 'sys', 'test', 'test1', 'test2', 'test3',
  'user', 'user1', 'user2', 'user3', 'user4', 'user5', 'video',
])

export interface VirtualMachineWrite {
  subscriptionId: string
  resourceGroupName: string
  name: string
  location: string
  vmSize: string
  image: string
  osDiskType: string
  adminUsername: string
  networkInterfaceId: ArmId
  tags?: Record<string, string>
}

const vmId = (p: VirtualMachineWrite) => resourceId(p.subscriptionId, p.resourceGroupName, VM_TYPE, p.name)
const osDiskName = (vmName: string) => `${vmName}_OsDisk_1`

/** VM-1 literally: no spaces, control characters or listed symbols, no trailing hyphen; Linux 1–64 (VM-1s). */
function checkVmName(name: string): Refusal | null {
  // eslint-disable-next-line no-control-regex
  if (name.length < 1 || name.length > 64 || /[\s\x00-\x1f~!@#$%^&*()=+_[\]{}\\|;:.'",<>/?]/.test(name) || name.endsWith('-')) {
    return rule('VM-1', 'Linux VM names are 1–64 characters without spaces or symbols (~ ! @ # $ % ^ & * ( ) = + _ [ ] { } \\ | ; : . \' " , < > / ?) and can\'t end with a hyphen.')
  }
  return null
}

function checkUsername(name: string): Refusal | null {
  if (name.length < 1 || name.length > 32) return rule('VM-2', 'The administrator username is 1–32 characters.')
  if (RESERVED_USERNAMES.has(name.toLowerCase())) return rule('VM-2', `'${name}' is one of the usernames Azure doesn't allow, such as admin, root or test.`)
  return null
}

/** VMs whose network profile includes this NIC. */
export const vmsUsingNic = (world: World, nicId: ArmId): Resource[] =>
  resourcesOfType(world, VM_TYPE).filter(vm => networkInterfacesOf(vm).some(n => sameName(n.id, nicId)))

export const networkInterfacesOf = (vm: Resource): { id: ArmId; properties: { primary: boolean } }[] =>
  ((vm.properties.networkProfile as { networkInterfaces?: { id: ArmId; properties: { primary: boolean } }[] } | undefined)?.networkInterfaces) ?? []

function checkVm(world: World, p: VirtualMachineWrite): Refusal | null {
  return firstRefusal(
    () => checkScope(world, p.subscriptionId, p.resourceGroupName),
    () => checkVmName(p.name),
    () => checkRegion(p.location),
    () => (getResource(world, vmId(p))
      ? notModelled('ARM-4u', `Virtual machine '${p.name}' already exists. Changing an existing VM isn't modelled yet.`)
      : null),
    () => (VM_SIZES.some(s => s.name === p.vmSize) ? null : notModelled('VM-13s', `Size '${p.vmSize}' isn't offered in the simulator. Pick a Bsv2 size.`)),
    () => (p.image in IMAGES ? null : notModelled('VM-12s', `Image '${p.image}' isn't offered in the simulator. Use Ubuntu Server 22.04 LTS.`)),
    () => {
      if (p.osDiskType === 'PremiumV2_LRS' || p.osDiskType === 'UltraSSD_LRS') {
        return rule('VM-11', `${p.osDiskType === 'PremiumV2_LRS' ? 'Premium SSD v2' : 'Ultra Disk'} can't be used as an OS disk.`)
      }
      return OS_DISK_TYPES.some(t => t.sku === p.osDiskType) ? null : notModelled('VM-11s', `OS disk type '${p.osDiskType}' isn't offered in the simulator.`)
    },
    () => (getResource(world, resourceId(p.subscriptionId, p.resourceGroupName, DISK_TYPE, osDiskName(p.name)))
      ? notModelled('VM-15s', `A disk named '${osDiskName(p.name)}' already exists in this resource group.`)
      : null),
    () => checkUsername(p.adminUsername),
    () => {
      const nic = getResource(world, p.networkInterfaceId)
      if (!nic || nic.type.toLowerCase() !== NIC_TYPE.toLowerCase()) return missing(`Network interface '${p.networkInterfaceId}'`)
      if (nic.location !== p.location || parseArmId(nic.id)?.subscriptionId !== p.subscriptionId) {
        return rule('NIC-1', `A VM's network interface must be in the same region and subscription as the VM. '${nic.name}' is in ${nic.location}.`)
      }
      const holder = vmsUsingNic(world, nic.id)[0]
      if (holder) return notModelled('VM-17u', `Network interface '${nic.name}' is already attached to '${holder.name}'.`)
      return null
    },
  )
}

/**
 * Create a Linux VM from the Ubuntu image with an existing NIC, its managed OS disk and SSH key
 * authentication (VM-9, VM-15s, VM-16s). It is running once the write succeeds.
 */
export const writeVirtualMachine: CommandHandler<VirtualMachineWrite> = {
  type: 'arm/virtualMachines/write',
  write: ({ payload }) => armWrite(VM_TYPE, vmId(payload)),
  validate: (world, { payload }) => checkVm(world, payload),
  apply(world, { payload, caller }) {
    const image = IMAGES[payload.image as ImageAlias]
    const id = vmId(payload)
    const diskName = osDiskName(payload.name)
    const diskId = resourceId(payload.subscriptionId, payload.resourceGroupName, DISK_TYPE, diskName)

    let w = putResource(world, stamp(world, caller, {
      id: diskId,
      type: DISK_TYPE,
      name: diskName,
      location: payload.location,
      tags: {},
      sku: { name: payload.osDiskType },
      properties: { osType: 'Linux', creationData: { createOption: 'FromImage' }, managedBy: id },
    }))
    w = putResource(w, stamp(w, caller, {
      id,
      type: VM_TYPE,
      name: payload.name,
      location: payload.location,
      tags: { ...(payload.tags ?? {}) },
      properties: {
        hardwareProfile: { vmSize: payload.vmSize },
        storageProfile: {
          imageReference: { publisher: image.publisher, offer: image.offer, sku: image.sku, version: image.version },
          osDisk: { name: diskName, createOption: 'FromImage', osType: 'Linux', deleteOption: 'Delete', managedDisk: { id: diskId, storageAccountType: payload.osDiskType } },
        },
        osProfile: {
          computerName: payload.name,
          adminUsername: payload.adminUsername,
          linuxConfiguration: {
            disablePasswordAuthentication: true,
            ssh: { publicKeys: [{ path: `/home/${payload.adminUsername}/.ssh/authorized_keys`, // VM-18
               keyData: '(simulated key pair, not a real key)' }] },
          },
        },
        networkProfile: { networkInterfaces: [{ id: payload.networkInterfaceId, properties: { primary: true } }] },
      },
    }))
    // Power state follows provisioning: creating now, running once the create succeeds (VM-19s).
    return { ...w, runtime: { ...w.runtime, [armKey(id)]: { health: 'unknown', reasons: [], powerState: 'creating' } } }
  },
}

export const powerStateOf = (world: World, vm: ArmId) => world.runtime[armKey(vm)]?.powerState ?? null

/**
 * Runtime system: a VM's power state follows its provisioning (VM-7, VM-19s). `creating` while the
 * create runs, `running` once it has succeeded. Leaves every other state alone.
 */
export const vmPowerSystem: System = world => {
  let runtime = world.runtime
  for (const vm of Object.values(world.tenant.resources)) {
    if (vm.type.toLowerCase() !== VM_TYPE.toLowerCase()) continue
    const key = armKey(vm.id)
    const current = runtime[key]
    const next = vm.provisioningState === 'Creating' ? 'creating'
      : vm.provisioningState === 'Succeeded' && (current?.powerState === undefined || current.powerState === 'creating') ? 'running'
      : current?.powerState
    if (next !== current?.powerState) {
      if (runtime === world.runtime) runtime = { ...runtime }
      runtime[key] = { health: current?.health ?? 'unknown', reasons: current?.reasons ?? [], ...(next ? { powerState: next } : {}) }
    }
  }
  return runtime === world.runtime ? world : { ...world, runtime }
}
