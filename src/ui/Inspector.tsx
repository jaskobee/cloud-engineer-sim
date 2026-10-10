import { useState } from 'react'
import { azure, type ArmId, type Refusal, type Resource, type Tenant } from '../engine/index.ts'
import { useGame } from './gameContext.ts'
import { RefusalNotice } from './RefusalNotice.tsx'
import { SimulatedApp } from './SimulatedApp.tsx'
import { typeLabel } from './resourceKinds.ts'
import { InfoButton } from './Info.tsx'
import { infoTopicForType } from '../missions/index.ts'

/** Details of the selected resource group or resource, read from the same world as everything else. */
export function Inspector({ id }: { id: ArmId }) {
  const tenant = useGame(s => s.world.tenant)
  const group = tenant.resourceGroups[azure.armKey(id)]
  const resource = tenant.resources[azure.armKey(id)]
  const parsed = azure.parseArmId(id)

  if (group) {
    const count = Object.values(tenant.resources).filter(r => azure.sameName(azure.parseArmId(r.id)?.resourceGroupName ?? '', group.name)).length
    return (
      <div className="inspector">
        <p className="inspector-type">Resource group <InfoButton topic="resource-group" /></p>
        <h2 className="inspector-name">{group.name}</h2>
        <Facts rows={[['Region', azure.regionDisplayName(group.location)], ['Resources', String(count)]]} />
        <IdLine id={group.id} />
      </div>
    )
  }
  if (!resource || !parsed) return <p className="empty">This resource no longer exists.</p>

  return (
    <div className="inspector">
      <p className="inspector-type">
        {typeLabel(resource.type)}
        {infoTopicForType(resource.type) && <InfoButton topic={infoTopicForType(resource.type) ?? ''} />}
      </p>
      <h2 className="inspector-name">{resource.name}</h2>
      <Facts rows={[
        ['Resource group', parsed.resourceGroupName],
        ['Region', resource.location === 'global' ? 'Global' : azure.regionDisplayName(resource.location)],
        ['Provisioning state', resource.provisioningState],
        ['Created by', resource.createdBy],
      ]} />
      <TypeDetails tenant={tenant} resource={resource} />
      <IdLine id={resource.id} />
    </div>
  )
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="facts">
      {rows.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  )
}

function IdLine({ id }: { id: ArmId }) {
  return <p className="resource-id"><span>Resource ID</span><code>{id}</code></p>
}

const of = (tenant: Tenant, type: string) => Object.values(tenant.resources).filter(r => r.type.toLowerCase() === type.toLowerCase())
const childrenOf = (tenant: Tenant, parent: Resource, type: string) =>
  of(tenant, type).filter(r => r.id.toLowerCase().startsWith(`${parent.id.toLowerCase()}/`))
const nameOf = (tenant: Tenant, id: string | null | undefined) => (id ? tenant.resources[id.toLowerCase()]?.name ?? id : 'None')

function TypeDetails({ tenant, resource }: { tenant: Tenant; resource: Resource }) {
  const startCreate = useGame(s => s.startCreate)
  const select = useGame(s => s.select)
  const p = resource.properties

  switch (resource.type.toLowerCase()) {
    case azure.VNET_TYPE.toLowerCase(): {
      const subnets = childrenOf(tenant, resource, azure.SUBNET_TYPE)
      return (
        <>
          <Facts rows={[['Address space', azure.addressPrefixesOf(resource).join(', ')], ['Subnets', subnets.map(s => s.name).join(', ') || 'None yet']]} />
          <div className="inspector-actions">
            <button type="button" className="button" onClick={() => startCreate({ kind: 'subnet', preset: { virtualNetworkId: resource.id } })}>Add a subnet</button>
          </div>
        </>
      )
    }
    case azure.SUBNET_TYPE.toLowerCase(): {
      const block = azure.parseCidr(String(p.addressPrefix))
      const nsgId = (p.networkSecurityGroup as { id?: string } | undefined)?.id ?? null
      const nics = of(tenant, azure.NIC_TYPE).filter(n => azure.ipConfigurationsOf(n).some(c => azure.sameName(c.properties.subnet.id, resource.id)))
      return (
        <>
          <Facts rows={[
            ['Address range', String(p.addressPrefix)],
            // Azure reserves five addresses in every subnet (SUB-2).
            ['Usable addresses', block ? String(block.size - 5) : '?'],
            ['Network security group', nameOf(tenant, nsgId)],
            ['Network interfaces', nics.map(n => n.name).join(', ') || 'None'],
            ['Default outbound access', p.defaultOutboundAccess === false ? 'Off (private subnet)' : 'On'],
          ]} />
          <div className="inspector-actions">
            <button type="button" className="button" onClick={() => startCreate({
              kind: 'subnet',
              preset: { mode: 'edit', virtualNetworkId: azure.parentResourceId(resource.id) ?? '', name: resource.name, addressPrefix: String(p.addressPrefix), networkSecurityGroupId: nsgId ?? '' },
            })}>Edit subnet</button>
          </div>
        </>
      )
    }
    case azure.NSG_TYPE.toLowerCase():
      return <NsgDetails tenant={tenant} nsg={resource} />
    case azure.SECURITY_RULE_TYPE.toLowerCase(): {
      const rule = azure.ruleProperties(resource)
      const nsgId = azure.parentResourceId(resource.id) ?? ''
      return (
        <>
          <Facts rows={ruleRows(rule)} />
          <div className="inspector-actions">
            <button type="button" className="button" onClick={() => select(nsgId)}>Open {nameOf(tenant, nsgId)}</button>
          </div>
        </>
      )
    }
    case azure.PUBLIC_IP_TYPE.toLowerCase(): {
      const nic = of(tenant, azure.NIC_TYPE).find(n => azure.ipConfigurationsOf(n).some(c => azure.sameName(c.properties.publicIPAddress?.id ?? '', resource.id)))
      return (
        <Facts rows={[
          // Made-up address from a documentation range (PIP-7s).
          ['IP address', `${String(p.ipAddress)} (made up)`],
          ['SKU', `${resource.sku?.name ?? ''}, ${resource.sku?.tier ?? ''}`],
          ['Assignment', `${String(p.publicIPAllocationMethod)}, ${String(p.publicIPAddressVersion)}`],
          ['Associated with', nic?.name ?? 'Nothing'],
        ]} />
      )
    }
    case azure.NIC_TYPE.toLowerCase(): {
      const config = azure.ipConfigurationsOf(resource)[0]
      const nsgId = azure.nicNsgId(resource)
      const parsed = azure.parseArmId(resource.id)
      return (
        <>
          <Facts rows={[
            ['Subnet', nameOf(tenant, config?.properties.subnet.id)],
            ['Private IP address', `${config?.properties.privateIPAddress ?? ''} (${config?.properties.privateIPAllocationMethod ?? ''})`],
            ['Public IP address', nameOf(tenant, config?.properties.publicIPAddress?.id)],
            ['Network security group', nameOf(tenant, nsgId)],
          ]} />
          <div className="inspector-actions">
            <button type="button" className="button" onClick={() => startCreate({
              kind: 'networkInterface',
              preset: {
                mode: 'edit', group: `${parsed?.subscriptionId ?? ''}|${parsed?.resourceGroupName ?? ''}`, name: resource.name, location: resource.location,
                subnetId: config?.properties.subnet.id ?? '', privateIPAllocationMethod: config?.properties.privateIPAllocationMethod ?? 'Dynamic',
                privateIPAddress: config?.properties.privateIPAddress ?? '', publicIPAddressId: config?.properties.publicIPAddress?.id ?? '',
                networkSecurityGroupId: nsgId ?? '',
              },
            })}>Edit network interface</button>
          </div>
        </>
      )
    }
    case azure.VM_TYPE.toLowerCase(): {
      const props = p as {
        hardwareProfile: { vmSize: string }
        storageProfile: { osDisk: { name: string; managedDisk: { id: string; storageAccountType: string } } }
        osProfile: { adminUsername: string }
      }
      const nicRef = azure.networkInterfacesOf(resource)[0]
      const nic = nicRef ? tenant.resources[azure.armKey(nicRef.id)] : undefined
      const config = nic ? azure.ipConfigurationsOf(nic)[0] : undefined
      const pip = config?.properties.publicIPAddress ? tenant.resources[azure.armKey(config.properties.publicIPAddress.id)] : undefined
      return (
        <>
          <PowerState id={resource.id} />
          <Facts rows={[
            ['Size', props.hardwareProfile.vmSize],
            ['Image', azure.IMAGES.Ubuntu2204.displayName],
            ['OS disk', `${props.storageProfile.osDisk.name} (${props.storageProfile.osDisk.managedDisk.storageAccountType})`],
            ['Administrator', props.osProfile.adminUsername],
            ['Network interface', nic?.name ?? 'None'],
            ['Private IP address', config?.properties.privateIPAddress ?? ''],
            ['Public IP address', pip ? String(pip.properties.ipAddress) : 'None'],
          ]} />
          {nic && (
            <div className="inspector-actions">
              <button type="button" className="button" onClick={() => select(nic.id)}>Open {nic.name}</button>
            </div>
          )}
          <SimulatedApp key={resource.id} vm={resource} />
        </>
      )
    }
    case azure.DISK_TYPE.toLowerCase():
      return (
        <Facts rows={[
          ['Disk type', `${azure.OS_DISK_TYPES.find(t => t.sku === resource.sku?.name)?.displayName ?? ''} (${resource.sku?.name ?? ''})`],
          ['OS', String(p.osType)],
          ['Attached to', nameOf(tenant, String(p.managedBy))],
        ]} />
      )
    case azure.WORKSPACE_TYPE.toLowerCase(): {
      const components = of(tenant, azure.COMPONENT_TYPE).filter(c => azure.sameName(azure.workspaceOfComponent(c) ?? '', resource.id))
      return (
        <Facts rows={[
          ['Pricing tier', String((p.sku as { name?: string } | undefined)?.name ?? '')],
          ['Retention', `${String(p.retentionInDays)} days (Application Insights tables: 90)`],
          ['Application Insights', components.map(c => c.name).join(', ') || 'None'],
        ]} />
      )
    }
    case azure.COMPONENT_TYPE.toLowerCase(): {
      const tests = of(tenant, azure.WEBTEST_TYPE).filter(t => azure.sameName(azure.webTestView(t).componentId ?? '', resource.id))
      return (
        <>
          <Facts rows={[
            ['Application type', String(p.Application_Type)],
            ['Log Analytics workspace', nameOf(tenant, azure.workspaceOfComponent(resource))],
            ['Availability tests', tests.map(t => t.name).join(', ') || 'None'],
          ]} />
          <div className="inspector-actions">
            <button type="button" className="button" onClick={() => startCreate({ kind: 'webTest', preset: { componentId: resource.id } })}>Add an availability test</button>
          </div>
        </>
      )
    }
    case azure.WEBTEST_TYPE.toLowerCase():
      return <WebTestDetails tenant={tenant} test={resource} />
    case azure.METRIC_ALERT_TYPE.toLowerCase():
      return <AlertRuleDetails tenant={tenant} alertRule={resource} />
    default:
      return null
  }
}

const groupOf = (r: Resource) => {
  const parsed = azure.parseArmId(r.id)
  return `${parsed?.subscriptionId ?? ''}|${parsed?.resourceGroupName ?? ''}`
}

/** A standard availability test (MON-17) with its newest result per location (MON-26s). */
function WebTestDetails({ tenant, test }: { tenant: Tenant; test: Resource }) {
  const startCreate = useGame(s => s.startCreate)
  const selectTab = useGame(s => s.selectTab)
  const availability = useGame(s => s.world.telemetry.availability)
  const view = azure.webTestView(test)
  const recent = availability.items.filter(r => azure.sameName(r.webTestId, test.id))
  const last = recent.slice(-view.locations.length)
  const percent = azure.availabilityPercent(last)
  const rules = of(tenant, azure.METRIC_ALERT_TYPE).filter(a => azure.sameName(azure.metricAlertView(a).webTestId, test.id))
  return (
    <>
      <Facts rows={[
        ['URL', view.url],
        ['Status', view.enabled ? 'Enabled' : 'Disabled'],
        ['Locations', view.locations.map(azure.testLocationName).join(', ')],
        ['Frequency', `Every ${view.frequencyMs / 60_000} minutes from each location`],
        ['Success criteria', `HTTP ${view.expectedStatus} within ${view.timeoutMs / 1000} s`],
        ['Application Insights', nameOf(tenant, view.componentId)],
        ['Alert rules', rules.map(r => r.name).join(', ') || 'None'],
        ['Latest round', percent === null ? 'No results yet' : `${last.filter(r => r.Success).length} of ${last.length} passed`],
      ]} />
      <div className="inspector-actions">
        <button type="button" className="button" onClick={() => selectTab('availability')}>Show results</button>
        <button type="button" className="button" onClick={() => startCreate({
          kind: 'webTest',
          preset: {
            mode: 'edit', group: groupOf(test), name: test.name, location: test.location, componentId: view.componentId ?? '', url: view.url,
            locations: view.locations.join(','), frequency: String(view.frequencyMs / 1000), timeout: String(view.timeoutMs / 1000),
            expectedStatus: String(view.expectedStatus), retries: String((test.properties as { RetryEnabled?: boolean }).RetryEnabled !== false), enabled: String(view.enabled),
          },
        })}>Edit test</button>
        {rules.length === 0 && (
          <button type="button" className="button" onClick={() => startCreate({ kind: 'metricAlert', preset: { webTestId: test.id } })}>Add an alert rule</button>
        )}
      </div>
    </>
  )
}

/** An availability alert rule (MON-22) and its current alert (MON-24). */
function AlertRuleDetails({ tenant, alertRule }: { tenant: Tenant; alertRule: Resource }) {
  const startCreate = useGame(s => s.startCreate)
  const selectTab = useGame(s => s.selectTab)
  const active = useGame(s => azure.activeAlertOf(s.world, alertRule.id))
  const view = azure.metricAlertView(alertRule)
  const test = tenant.resources[azure.armKey(view.webTestId)]
  const n = test ? azure.webTestView(test).locations.length : 0
  return (
    <>
      <p className={`alert-state ${active ? 'is-fired' : 'is-quiet'}`} role="status">
        {active ? `Fired: ${active.failedLocations.length} locations failing` : 'No alert fired'}
      </p>
      <Facts rows={[
        ['Availability test', test?.name ?? view.webTestId],
        ['Fires when', `${view.failedLocationCount} of ${n} locations fail`],
        ['Checked', `Every ${view.evaluationMs / 60_000} min over the last ${view.windowMs / 60_000} min`],
        ['Severity', `Sev ${view.severity}`],
        ['Resolves', view.autoMitigate ? 'Automatically, after three checks without failures' : 'Not automatically'],
        ['Status', view.enabled ? 'Enabled' : 'Disabled'],
        ...(view.description ? [['Description', view.description] as [string, string]] : []),
      ]} />
      <div className="inspector-actions">
        <button type="button" className="button" onClick={() => selectTab('alerts')}>Show alerts</button>
        <button type="button" className="button" onClick={() => startCreate({
          kind: 'metricAlert',
          preset: {
            mode: 'edit', group: groupOf(alertRule), name: alertRule.name, webTestId: view.webTestId, failedLocationCount: String(view.failedLocationCount),
            severity: String(view.severity), evaluationFrequency: String(alertRule.properties.evaluationFrequency), windowSize: String(alertRule.properties.windowSize),
            autoMitigate: String(view.autoMitigate), enabled: String(view.enabled), description: view.description,
          },
        })}>Edit alert rule</button>
      </div>
    </>
  )
}

/** Power state from the runtime record (VM-7), not from the desired configuration. */
function PowerState({ id }: { id: ArmId }) {
  const state = useGame(s => s.world.runtime[azure.armKey(id)]?.powerState ?? null)
  const label = state ? state[0]?.toUpperCase() + state.slice(1) : 'Unknown'
  return (
    <p className={`power power-${state ?? 'unknown'}`}>
      <span className="power-led" aria-hidden="true" />
      {label}
    </p>
  )
}

const PROTOCOL_LABEL: Record<string, string> = { '*': 'Any', Tcp: 'TCP', Udp: 'UDP', Icmp: 'ICMP', Esp: 'ESP', Ah: 'AH' }

function ruleRows(rule: azure.SecurityRuleProperties): [string, string][] {
  return [
    ['Priority', String(rule.priority)],
    ['Direction', rule.direction],
    ['Action', rule.access],
    ['Protocol', PROTOCOL_LABEL[rule.protocol] ?? rule.protocol],
    ['Source', `${rule.sourceAddressPrefix}, port ${rule.sourcePortRange}`],
    ['Destination', `${rule.destinationAddressPrefix}, port ${rule.destinationPortRange}`],
    ...(rule.description ? [['Description', rule.description] as [string, string]] : []),
  ]
}

/** An NSG's rules in the order Azure processes them: custom rules by priority, then the defaults (NSG-1, NSG-3). */
function NsgDetails({ tenant, nsg }: { tenant: Tenant; nsg: Resource }) {
  const startCreate = useGame(s => s.startCreate)
  const select = useGame(s => s.select)
  const dispatch = useGame(s => s.dispatch)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const custom = childrenOf(tenant, nsg, azure.SECURITY_RULE_TYPE)
  const defaults = (nsg.properties.defaultSecurityRules as azure.DefaultSecurityRule[] | undefined) ?? []
  const subnets = of(tenant, azure.SUBNET_TYPE).filter(s => azure.sameName((s.properties.networkSecurityGroup as { id?: string } | undefined)?.id ?? '', nsg.id))
  const nics = of(tenant, azure.NIC_TYPE).filter(n => azure.sameName(azure.nicNsgId(n) ?? '', nsg.id))

  const remove = (ruleId: ArmId) => {
    const outcome = dispatch({ type: 'arm/securityRules/delete', payload: { securityRuleId: ruleId } })
    setRefusal(outcome.status === 'refused' ? outcome.refusal : null)
  }
  const edit = (r: Resource) => {
    const rule = azure.ruleProperties(r)
    startCreate({
      kind: 'securityRule',
      preset: {
        mode: 'edit', networkSecurityGroupId: nsg.id, name: r.name, priority: String(rule.priority), direction: rule.direction,
        access: rule.access, protocol: rule.protocol, sourceAddressPrefix: rule.sourceAddressPrefix, sourcePortRange: rule.sourcePortRange,
        destinationAddressPrefix: rule.destinationAddressPrefix, destinationPortRange: rule.destinationPortRange, description: rule.description ?? '',
      },
    })
  }

  return (
    <>
      <Facts rows={[
        ['Subnets', subnets.map(s => s.name).join(', ') || 'None'],
        ['Network interfaces', nics.map(n => n.name).join(', ') || 'None'],
      ]} />
      {refusal && <RefusalNotice refusal={refusal} />}
      {(['Inbound', 'Outbound'] as const).map(direction => {
        const rules = [
          ...custom.map(r => ({ resource: r as Resource | null, name: r.name, rule: azure.ruleProperties(r) })),
          ...defaults.map(d => ({ resource: null, name: d.name, rule: d as azure.SecurityRuleProperties })),
        ].filter(x => x.rule.direction === direction).sort((a, b) => a.rule.priority - b.rule.priority)
        return (
          <section key={direction} className="rules" aria-label={`${direction} security rules`}>
            <h3 className="rules-title">{direction} rules, in processing order</h3>
            <ol className="rule-list">
              {rules.map(({ resource, name, rule }) => (
                <li key={name} className={resource ? 'rule-item' : 'rule-item rule-default'}>
                  <span className="rule-priority mono">{rule.priority}</span>
                  <span className="rule-main">
                    {resource ? <button type="button" className="link-button rule-name" onClick={() => select(resource.id)}>{name}</button> : <span className="rule-name">{name}</span>}
                    <span className="rule-desc">
                      {PROTOCOL_LABEL[rule.protocol] ?? rule.protocol} port {rule.destinationPortRange} from {rule.sourceAddressPrefix}
                    </span>
                    {resource && (
                      <span className="rule-actions">
                        <button type="button" className="link-button" onClick={() => edit(resource)}>Edit</button>
                        <button type="button" className="link-button danger" onClick={() => remove(resource.id)}>Delete</button>
                      </span>
                    )}
                  </span>
                  <span className={`access access-${rule.access.toLowerCase()}`}>{rule.access}</span>
                </li>
              ))}
            </ol>
          </section>
        )
      })}
      <p className="field-hint">Default rules can't be changed. Add rules with a lower number to override them.</p>
      <div className="inspector-actions">
        <button type="button" className="button" onClick={() => startCreate({ kind: 'securityRule', preset: { networkSecurityGroupId: nsg.id } })}>Add a security rule</button>
      </div>
    </>
  )
}
