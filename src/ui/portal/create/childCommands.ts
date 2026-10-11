import { azure, type ArmId, type World } from '../../../engine/index.ts'
import type { PlayerCommand } from '../../../store/gameStore.ts'
import type { Values } from './commands.ts'

/**
 * Side pane forms (PORTAL-11, PORTAL-12, PORTAL-12s, PORTAL-17, PORTAL-17s): their starting values and the
 * command each sends, as plain functions. The commands are the same ones the old forms sent.
 */

/** Service tags the simulator models (NSG-11s). */
export const SERVICE_TAGS = ['Internet', 'VirtualNetwork', 'AzureLoadBalancer'] as const

/** Source and Destination types in the rule pane (PORTAL-12s: Any, IP Addresses, Service Tag). */
export type AddressKind = 'Any' | 'IP Addresses' | 'Service Tag'

export function addressKind(prefix: string): AddressKind {
  if (prefix === '*' || prefix === '') return 'Any'
  return (SERVICE_TAGS as readonly string[]).includes(prefix) ? 'Service Tag' : 'IP Addresses'
}

const addressOf = (kind: string, ip: string, tag: string) => (kind === 'Any' ? '*' : kind === 'Service Tag' ? tag : ip.trim())

/** Five locations, so a 5-minute test runs about once a minute (MON-2). */
export const DEFAULT_TEST_LOCATIONS = ['emea-nl-ams-azr', 'emea-gb-db3-azr', 'emea-fr-pra-edge', 'emea-ru-msa-edge', 'emea-se-sto-edge']

const subnetNsgId = (world: World, subnetId: string) =>
  (world.tenant.resources[azure.armKey(subnetId)]?.properties.networkSecurityGroup as { id?: string } | undefined)?.id ?? ''

export function initialChild(kind: string, preset: Record<string, string>, world: World, targetId?: ArmId): Values {
  const p = (k: string, fallback = '') => preset[k] ?? fallback
  switch (kind) {
    case 'securityRule': {
      const source = p('sourceAddressPrefix', '*')
      const destination = p('destinationAddressPrefix', '*')
      return {
        networkSecurityGroupId: p('networkSecurityGroupId'), mode: p('mode'), name: p('name'), priority: p('priority', '100'), direction: p('direction', 'Inbound'),
        access: p('access', 'Allow'), protocol: p('protocol', 'Tcp'), description: p('description'),
        sourceType: addressKind(source), source: addressKind(source) === 'IP Addresses' ? source : '', sourceTag: addressKind(source) === 'Service Tag' ? source : 'Internet',
        sourcePortRange: p('sourcePortRange', '*'),
        destinationType: addressKind(destination), destination: addressKind(destination) === 'IP Addresses' ? destination : '',
        destinationTag: addressKind(destination) === 'Service Tag' ? destination : 'VirtualNetwork',
        destinationPortRange: p('destinationPortRange'),
      }
    }
    case 'subnet':
      return { mode: p('mode'), virtualNetworkId: p('virtualNetworkId'), name: p('name'), addressPrefix: p('addressPrefix'), networkSecurityGroupId: p('networkSecurityGroupId') }
    case 'associateSubnet': {
      const subnet = Object.values(world.tenant.resources).find(r => r.type.toLowerCase() === azure.SUBNET_TYPE.toLowerCase())
      return { networkSecurityGroupId: p('networkSecurityGroupId'), virtualNetworkId: subnet ? azure.parentResourceId(subnet.id) ?? '' : '', subnetId: subnet?.id ?? '' }
    }
    case 'webTest': {
      const pip = Object.values(world.tenant.resources).find(r => r.type.toLowerCase() === azure.PUBLIC_IP_TYPE.toLowerCase())
      return {
        mode: p('mode'), componentId: p('componentId'), name: p('name'), url: p('url', pip ? `https://${String(pip.properties.ipAddress)}/health` : 'https://'),
        locations: p('locations', DEFAULT_TEST_LOCATIONS.join(',')), frequency: p('frequency', '300'), timeout: p('timeout', '30'),
        expectedStatus: p('expectedStatus', '200'), retries: p('retries', 'true'), enabled: p('enabled', 'true'),
        group: p('group'), location: p('location'),
      }
    }
    case 'metricAlert': {
      const test = world.tenant.resources[azure.armKey(p('webTestId'))]
      const n = test ? azure.webTestView(test).locations.length : 5
      return {
        mode: p('mode'), webTestId: p('webTestId'), name: p('name'), failedLocationCount: p('failedLocationCount', String(Math.max(1, n - 2))),
        severity: p('severity', '1'), evaluationFrequency: p('evaluationFrequency', 'PT1M'), windowSize: p('windowSize', 'PT5M'),
        autoMitigate: p('autoMitigate', 'true'), enabled: p('enabled', 'true'), description: p('description'), group: p('group'),
      }
    }
    case 'networkInterface': {
      const nic = targetId ? world.tenant.resources[azure.armKey(targetId)] : undefined
      const config = nic ? azure.ipConfigurationsOf(nic)[0] : undefined
      const parsed = nic ? azure.parseArmId(nic.id) : null
      return {
        mode: 'edit', nicId: nic?.id ?? '', name: nic?.name ?? p('name'), subscriptionId: parsed?.subscriptionId ?? '', resourceGroupName: parsed?.resourceGroupName ?? '',
        location: nic?.location ?? p('location'), subnetId: config?.properties.subnet.id ?? p('subnetId'),
        privateIPAllocationMethod: config?.properties.privateIPAllocationMethod ?? p('privateIPAllocationMethod', 'Dynamic'),
        privateIPAddress: config?.properties.privateIPAddress ?? p('privateIPAddress'),
        publicIPAddressId: config?.properties.publicIPAddress?.id ?? p('publicIPAddressId'), networkSecurityGroupId: nic ? azure.nicNsgId(nic) ?? '' : p('networkSecurityGroupId'),
      }
    }
    default:
      return { ...preset }
  }
}

/** The group a child resource goes into: its parent's (availability tests and alert rules live with what they watch). */
function groupOfResource(world: World, id: string): { subscriptionId: string; resourceGroupName: string; location: string } {
  const r = world.tenant.resources[azure.armKey(id)]
  const parsed = azure.parseArmId(id)
  return { subscriptionId: parsed?.subscriptionId ?? '', resourceGroupName: parsed?.resourceGroupName ?? '', location: r?.location ?? 'westeurope' }
}

const fromGroup = (values: Values) => {
  const [subscriptionId = '', resourceGroupName = ''] = (values.group ?? '').split('|')
  return { subscriptionId, resourceGroupName }
}

export function childCommand(kind: string, values: Values, world?: World): PlayerCommand | null {
  const v = (k: string) => values[k] ?? ''
  switch (kind) {
    case 'securityRule':
      return {
        type: 'arm/securityRules/write',
        payload: {
          networkSecurityGroupId: v('networkSecurityGroupId'), name: v('name'),
          properties: {
            priority: Number(v('priority')), direction: v('direction'), access: v('access'), protocol: v('protocol'),
            sourceAddressPrefix: addressOf(v('sourceType'), v('source'), v('sourceTag')), sourcePortRange: v('sourcePortRange'),
            destinationAddressPrefix: addressOf(v('destinationType'), v('destination'), v('destinationTag')), destinationPortRange: v('destinationPortRange'),
            ...(v('description') ? { description: v('description') } : {}),
          },
        },
      }
    case 'subnet':
      return { type: 'arm/subnets/write', payload: { virtualNetworkId: v('virtualNetworkId'), name: v('name'), addressPrefix: v('addressPrefix'), networkSecurityGroupId: v('networkSecurityGroupId') || null } }
    case 'associateSubnet': {
      const subnet = world?.tenant.resources[azure.armKey(v('subnetId'))]
      if (!subnet) return null
      return { type: 'arm/subnets/write', payload: { virtualNetworkId: azure.parentResourceId(subnet.id) ?? '', name: subnet.name, addressPrefix: String(subnet.properties.addressPrefix), networkSecurityGroupId: v('networkSecurityGroupId') } }
    }
    case 'webTest': {
      const where = v('group') ? { ...fromGroup(values), location: v('location') } : world ? groupOfResource(world, v('componentId')) : { subscriptionId: '', resourceGroupName: '', location: '' }
      const locations = v('locations').split(',').filter(Boolean)
      return {
        type: 'arm/webtests/write',
        payload: {
          ...where, name: v('name'), componentId: v('componentId'),
          settings: {
            Enabled: v('enabled') !== 'false', Frequency: Number(v('frequency')), Timeout: Number(v('timeout')), RetryEnabled: v('retries') !== 'false',
            Locations: azure.TEST_LOCATIONS.map(l => l.id).filter(id => locations.includes(id)), RequestUrl: v('url'), ExpectedHttpStatusCode: Number(v('expectedStatus')),
          },
        },
      }
    }
    case 'metricAlert': {
      const where = v('group') ? fromGroup(values) : world ? groupOfResource(world, v('webTestId')) : { subscriptionId: '', resourceGroupName: '' }
      return {
        type: 'arm/metricAlerts/write',
        payload: {
          subscriptionId: where.subscriptionId, resourceGroupName: where.resourceGroupName, name: v('name'), webTestId: v('webTestId'),
          severity: Number(v('severity')), enabled: v('enabled') !== 'false', evaluationFrequency: v('evaluationFrequency'), windowSize: v('windowSize'),
          failedLocationCount: Number(v('failedLocationCount')), autoMitigate: v('autoMitigate') !== 'false', ...(v('description') ? { description: v('description') } : {}),
        },
      }
    }
    case 'networkInterface': {
      // The IP configuration pane changes the public IP; the NSG is a NIC-level setting with its own page (PORTAL-13).
      const nic = world?.tenant.resources[azure.armKey(v('nicId'))]
      const nsg = nic ? azure.nicNsgId(nic) : v('networkSecurityGroupId') || null
      return {
        type: 'arm/networkInterfaces/write',
        payload: {
          subscriptionId: v('subscriptionId'), resourceGroupName: v('resourceGroupName'), name: v('name'), location: v('location'), subnetId: v('subnetId'),
          privateIPAllocationMethod: v('privateIPAllocationMethod'), ...(v('privateIPAllocationMethod') === 'Static' ? { privateIPAddress: v('privateIPAddress') } : {}),
          publicIPAddressId: v('publicIPAddressId') || null, networkSecurityGroupId: nsg ?? null,
        },
      }
    }
    default:
      return null
  }
}

/** Where a pane's resource is shown afterwards, and whether subnet NSGs differ (for the associate pane's hint). */
export const currentSubnetNsg = subnetNsgId
