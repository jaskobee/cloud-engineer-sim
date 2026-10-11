import { azure, type Resource, type ResourceGroup, type Tenant, type World } from '../../engine/index.ts'

/**
 * What a resource page shows as facts, as plain rows (testable without React). Essentials comes first
 * (PORTAL-4, PORTAL-4s), then the type's own properties, read from the same world as everything else.
 */
export type Row = [string, string]

const of = (tenant: Tenant, type: string) => Object.values(tenant.resources).filter(r => r.type.toLowerCase() === type.toLowerCase())
const nameOf = (tenant: Tenant, id: string | null | undefined) => (id ? tenant.resources[id.toLowerCase()]?.name ?? id : 'None')
const region = (location: string) => (location === 'global' ? 'Global' : azure.regionDisplayName(location))
const tags = (t: Record<string, string>) => {
  // hidden-link tags are how availability tests point at Application Insights (MON-17); the portal hides them too.
  const shown = Object.entries(t).filter(([k]) => !k.startsWith('hidden-link:'))
  return shown.length ? shown.map(([k, v]) => `${k}: ${v}`).join(', ') : 'None'
}

const isResource = (r: Resource | ResourceGroup): r is Resource => typeof (r as Partial<Resource>).type === 'string'

export function essentialsRows(r: Resource | ResourceGroup, world: World): Row[] {
  const parsed = azure.parseArmId(r.id)
  const subscriptionId = parsed?.subscriptionId ?? ''
  const subscription = world.tenant.subscriptions[subscriptionId]?.displayName ?? subscriptionId
  if (!isResource(r)) {
    const deployments = Object.values(world.deployments).filter(d => d.subscriptionId === subscriptionId && azure.sameName(d.resourceGroupName ?? '', r.name))
    const succeeded = deployments.filter(d => d.provisioningState === 'Succeeded').length
    return [
      ['Subscription', subscription],
      ['Subscription ID', subscriptionId],
      ['Location', region(r.location)],
      ['Tags', tags(r.tags)],
      ['Deployments', deployments.length ? `${succeeded} Succeeded${deployments.length > succeeded ? `, ${deployments.length - succeeded} other` : ''}` : 'None'],
    ]
  }
  return [
    ['Resource group', parsed?.resourceGroupName ?? ''],
    ['Location', region(r.location)],
    ['Subscription', subscription],
    ['Subscription ID', subscriptionId],
    ['Tags', tags(r.tags)],
    ...propertyRows(r, world),
  ]
}

/** The type's own properties (what the old inspector showed), without actions. */
export function propertyRows(resource: Resource, world: World): Row[] {
  const { tenant } = world
  const p = resource.properties
  switch (resource.type.toLowerCase()) {
    case azure.VNET_TYPE.toLowerCase(): {
      const subnets = of(tenant, azure.SUBNET_TYPE).filter(s => azure.sameName(azure.parentResourceId(s.id) ?? '', resource.id))
      return [['Address space', azure.addressPrefixesOf(resource).join(', ')], ['Subnets', subnets.map(s => s.name).join(', ') || 'None yet']]
    }
    case azure.NSG_TYPE.toLowerCase(): {
      const subnets = of(tenant, azure.SUBNET_TYPE).filter(s => azure.sameName((s.properties.networkSecurityGroup as { id?: string } | undefined)?.id ?? '', resource.id))
      const nics = of(tenant, azure.NIC_TYPE).filter(n => azure.sameName(azure.nicNsgId(n) ?? '', resource.id))
      const custom = of(tenant, azure.SECURITY_RULE_TYPE).filter(r => azure.sameName(azure.parentResourceId(r.id) ?? '', resource.id))
      const inbound = custom.filter(r => azure.ruleProperties(r).direction === 'Inbound').length
      return [
        ['Subnets', subnets.map(s => s.name).join(', ') || 'None'],
        ['Network interfaces', nics.map(n => n.name).join(', ') || 'None'],
        ['Custom rules', `${inbound} inbound, ${custom.length - inbound} outbound`],
      ]
    }
    case azure.PUBLIC_IP_TYPE.toLowerCase(): {
      const nic = of(tenant, azure.NIC_TYPE).find(n => azure.ipConfigurationsOf(n).some(c => azure.sameName(c.properties.publicIPAddress?.id ?? '', resource.id)))
      return [
        // Made-up address from a documentation range (PIP-7s).
        ['IP address', `${String(p.ipAddress)} (made up)`],
        ['SKU', `${resource.sku?.name ?? ''}, ${resource.sku?.tier ?? ''}`],
        ['Assignment', `${String(p.publicIPAllocationMethod)}, ${String(p.publicIPAddressVersion)}`],
        ['Associated with', nic?.name ?? 'Nothing'],
      ]
    }
    case azure.NIC_TYPE.toLowerCase(): {
      const config = azure.ipConfigurationsOf(resource)[0]
      const vm = of(tenant, azure.VM_TYPE).find(v => azure.networkInterfacesOf(v).some(n => azure.sameName(n.id, resource.id)))
      return [
        ['Virtual machine', vm?.name ?? 'Not attached'],
        ['Subnet', nameOf(tenant, config?.properties.subnet.id)],
        ['Private IP address', `${config?.properties.privateIPAddress ?? ''} (${config?.properties.privateIPAllocationMethod ?? ''})`],
        ['Public IP address', nameOf(tenant, config?.properties.publicIPAddress?.id)],
        ['Network security group', nameOf(tenant, azure.nicNsgId(resource))],
      ]
    }
    case azure.VM_TYPE.toLowerCase(): {
      const props = p as {
        hardwareProfile: { vmSize: string }
        storageProfile: { osDisk: { name: string; managedDisk: { storageAccountType: string } } }
        osProfile: { adminUsername: string }
      }
      const nicRef = azure.networkInterfacesOf(resource)[0]
      const nic = nicRef ? tenant.resources[azure.armKey(nicRef.id)] : undefined
      const config = nic ? azure.ipConfigurationsOf(nic)[0] : undefined
      const pip = config?.properties.publicIPAddress ? tenant.resources[azure.armKey(config.properties.publicIPAddress.id)] : undefined
      return [
        ['Size', props.hardwareProfile.vmSize],
        ['Image', azure.IMAGES.Ubuntu2204.displayName],
        ['OS disk', `${props.storageProfile.osDisk.name} (${props.storageProfile.osDisk.managedDisk.storageAccountType})`],
        ['Administrator', props.osProfile.adminUsername],
        ['Network interface', nic?.name ?? 'None'],
        ['Private IP address', config?.properties.privateIPAddress ?? ''],
        ['Public IP address', pip ? `${String(pip.properties.ipAddress)} (made up)` : 'None'],
      ]
    }
    case azure.DISK_TYPE.toLowerCase():
      return [
        ['Disk type', `${azure.OS_DISK_TYPES.find(t => t.sku === resource.sku?.name)?.displayName ?? ''} (${resource.sku?.name ?? ''})`],
        ['OS', String(p.osType)],
        ['Attached to', nameOf(tenant, String(p.managedBy))],
      ]
    case azure.WORKSPACE_TYPE.toLowerCase(): {
      const components = of(tenant, azure.COMPONENT_TYPE).filter(c => azure.sameName(azure.workspaceOfComponent(c) ?? '', resource.id))
      return [
        // MON-30: pay-as-you-go by default; this is the ARM sku.name the simulator stores.
        ['SKU (ARM)', String((p.sku as { name?: string } | undefined)?.name ?? '')],
        ['Retention', `${String(p.retentionInDays)} days (Application Insights tables: 90)`],
        ['Application Insights', components.map(c => c.name).join(', ') || 'None'],
      ]
    }
    case azure.COMPONENT_TYPE.toLowerCase(): {
      const tests = of(tenant, azure.WEBTEST_TYPE).filter(t => azure.sameName(azure.webTestView(t).componentId ?? '', resource.id))
      return [
        ['Application type', String(p.Application_Type)],
        ['Log Analytics workspace', nameOf(tenant, azure.workspaceOfComponent(resource))],
        ['Availability tests', tests.map(t => t.name).join(', ') || 'None'],
      ]
    }
    case azure.WEBTEST_TYPE.toLowerCase(): {
      const view = azure.webTestView(resource)
      const rules = of(tenant, azure.METRIC_ALERT_TYPE).filter(a => azure.sameName(azure.metricAlertView(a).webTestId, resource.id))
      return [
        ['URL', view.url],
        ['Status', view.enabled ? 'Enabled' : 'Disabled'],
        ['Locations', view.locations.map(azure.testLocationName).join(', ')],
        ['Frequency', `Every ${view.frequencyMs / 60_000} minutes from each location`],
        ['Success criteria', `HTTP ${view.expectedStatus} within ${view.timeoutMs / 1000} s`],
        ['Application Insights', nameOf(tenant, view.componentId)],
        ['Alert rules', rules.map(r => r.name).join(', ') || 'None'],
      ]
    }
    case azure.METRIC_ALERT_TYPE.toLowerCase(): {
      const view = azure.metricAlertView(resource)
      const test = tenant.resources[azure.armKey(view.webTestId)]
      const n = test ? azure.webTestView(test).locations.length : 0
      return [
        ['Availability test', test?.name ?? view.webTestId],
        ['Fires when', `${view.failedLocationCount} of ${n} locations fail`],
        ['Checked', `Every ${view.evaluationMs / 60_000} min over the last ${view.windowMs / 60_000} min`],
        ['Severity', `Sev ${view.severity}`],
        ['Resolves', view.autoMitigate ? 'Automatically, once the condition isn\'t met for three consecutive checks' : 'Not automatically'],
        ['Status', view.enabled ? 'Enabled' : 'Disabled'],
        ...(view.description ? [['Description', view.description] as Row] : []),
      ]
    }
    default:
      return []
  }
}
