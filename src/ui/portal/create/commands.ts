import { azure, type ArmId, type Refusal } from '../../../engine/index.ts'
import type { PlayerCommand } from '../../../store/gameStore.ts'

/**
 * The commands a create wizard sends (PORTAL-6, PORTAL-7): plain functions of the form's values, so they can
 * be tested without React. "Create new" resource group writes the group first, as the portal deploys it.
 */
export type Values = Record<string, string>

const v = (values: Values, key: string) => values[key] ?? ''

function withGroup(values: Values, command: PlayerCommand): PlayerCommand[] {
  if (v(values, 'newResourceGroup') !== 'true') return [command]
  return [{ type: 'arm/resourceGroups/write', payload: { subscriptionId: v(values, 'subscriptionId'), name: v(values, 'resourceGroupName'), location: v(values, 'location') } }, command]
}

const basics = (values: Values) => ({
  subscriptionId: v(values, 'subscriptionId'), resourceGroupName: v(values, 'resourceGroupName'), name: v(values, 'name'), location: v(values, 'location'),
})

export function buildCommands(kind: string, values: Values): PlayerCommand[] {
  switch (kind) {
    case 'resourceGroup':
      return [{ type: 'arm/resourceGroups/write', payload: { subscriptionId: v(values, 'subscriptionId'), name: v(values, 'name'), location: v(values, 'location') } }]
    case 'virtualNetwork':
      return withGroup(values, { type: 'arm/virtualNetworks/write', payload: { ...basics(values), addressPrefixes: [v(values, 'addressSpace')] } })
    case 'networkSecurityGroup':
      return withGroup(values, { type: 'arm/networkSecurityGroups/write', payload: basics(values) })
    case 'publicIp':
      return withGroup(values, {
        type: 'arm/publicIPAddresses/write',
        payload: { ...basics(values), sku: { name: 'Standard', tier: 'Regional' }, publicIPAllocationMethod: 'Static', publicIPAddressVersion: 'IPv4' },
      })
    case 'networkInterface': {
      const method = v(values, 'privateIPAllocationMethod') || 'Dynamic'
      return withGroup(values, {
        type: 'arm/networkInterfaces/write',
        payload: {
          ...basics(values), subnetId: v(values, 'subnetId'), privateIPAllocationMethod: method,
          ...(method === 'Static' ? { privateIPAddress: v(values, 'privateIPAddress') } : {}),
          publicIPAddressId: null, networkSecurityGroupId: null,
        },
      })
    }
    case 'virtualMachine':
      return withGroup(values, {
        type: 'arm/virtualMachines/write',
        payload: {
          ...basics(values), vmSize: v(values, 'vmSize'), image: 'Ubuntu2204', osDiskType: v(values, 'osDiskType'),
          adminUsername: v(values, 'adminUsername'), networkInterfaceId: v(values, 'networkInterfaceId'),
        },
      })
    case 'workspace':
      return withGroup(values, { type: 'arm/workspaces/write', payload: basics(values) })
    case 'component':
      return withGroup(values, { type: 'arm/components/write', payload: { ...basics(values), workspaceResourceId: v(values, 'workspaceId') } })
    default:
      return []
  }
}

const TYPES: Record<string, string> = {
  virtualNetwork: azure.VNET_TYPE, networkSecurityGroup: azure.NSG_TYPE, publicIp: azure.PUBLIC_IP_TYPE, networkInterface: azure.NIC_TYPE,
  virtualMachine: azure.VM_TYPE, workspace: azure.WORKSPACE_TYPE, component: azure.COMPONENT_TYPE,
}

/** What "Go to resource" opens after Create. */
export function targetIdOf(kind: string, values: Values): ArmId | null {
  if (kind === 'resourceGroup') return azure.resourceGroupId(v(values, 'subscriptionId'), v(values, 'name'))
  const type = TYPES[kind]
  return type ? azure.resourceId(v(values, 'subscriptionId'), v(values, 'resourceGroupName'), type, v(values, 'name')) : null
}

export interface Review {
  key: string
  refusal: Refusal | null
}

export const reviewKey = (commands: PlayerCommand[]): string => JSON.stringify(commands)

/** Create is enabled only for exactly the commands that passed Review + create (editing after it reviews again). */
export const canCreate = (review: Review | null, commands: PlayerCommand[]): boolean =>
  review !== null && review.refusal === null && review.key === reviewKey(commands) && commands.length > 0
