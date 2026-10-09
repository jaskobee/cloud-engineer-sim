/**
 * Azure resource types the simulator models, as command handlers (step 4: control plane).
 * Every rule they enforce cites Docs/AZURE_FACTS.md.
 */
import type { CommandHandler } from '../commands.ts'
import { deleteSecurityRule, writeNetworkSecurityGroup, writeSecurityRule } from './networkSecurityGroups.ts'
import { writeNetworkInterface, writePublicIpAddress } from './networkInterfaces.ts'
import { addSubscription, writeResourceGroup } from './resourceGroups.ts'
import { writeSubnet, writeVirtualNetwork } from './virtualNetworks.ts'
import { writeVirtualMachine } from './virtualMachines.ts'

export * from './armId.ts'
export * from './cidr.ts'
export { REGIONS, regionDisplayName, getResource, getResourceGroup, resourcesOfType, childResources } from './common.ts'
export * from './resourceGroups.ts'
export * from './virtualNetworks.ts'
export * from './networkSecurityGroups.ts'
export * from './networkInterfaces.ts'
export * from './virtualMachines.ts'
export * from './flow.ts'
import { withProvisioning } from './provisioning.ts'

export * from './provisioning.ts'

/** Every Azure command, with its provisioning duration (ARM-12s, ARM-13s). */
export const AZURE_COMMANDS: readonly CommandHandler[] = ([
  addSubscription as CommandHandler,
  writeResourceGroup as CommandHandler,
  writeVirtualNetwork as CommandHandler,
  writeSubnet as CommandHandler,
  writeNetworkSecurityGroup as CommandHandler,
  writeSecurityRule as CommandHandler,
  deleteSecurityRule as CommandHandler,
  writePublicIpAddress as CommandHandler,
  writeNetworkInterface as CommandHandler,
  writeVirtualMachine as CommandHandler,
] as CommandHandler[]).map(withProvisioning)
