import { Link, ToolbarButton } from '@fluentui/react-components'
import { Add20Regular, Edit20Regular, Open20Regular } from '@fluentui/react-icons'
import { azure, type Resource } from '../../../engine/index.ts'
import { ActivityLogPanel } from '../../ActivityLogPanel.tsx'
import { AlertsPanel } from '../../AlertsPanel.tsx'
import { AvailabilityPanel } from '../../AvailabilityPanel.tsx'
import { DeploymentsPanel } from '../../DeploymentsPanel.tsx'
import { useGame } from '../../gameContext.ts'
import { MetricsPanel } from '../../MetricsPanel.tsx'
import { SimulatedApp } from '../../SimulatedApp.tsx'
import { typeLabel } from '../../resourceKinds.ts'
import { Essentials, ResourceLink } from './common.tsx'
import { asResource, type SectionDef, type SectionProps } from './types.ts'

const of = (world: SectionProps['world'], type: string) => Object.values(world.tenant.resources).filter(r => r.type.toLowerCase() === type.toLowerCase())

// ── Every resource ──────────────────────────────────────────────────────────────────────────────

export const ACTIVITY_LOG: SectionDef = { Body: ({ target }) => <ActivityLogPanel scope={target.id} /> }

// ── Resource group ─────────────────────────────────────────────────────────────────────────────

function GroupOverview(props: SectionProps) {
  const { target, world } = props
  const navigate = useGame(s => s.navigate)
  const parsed = azure.parseArmId(target.id)
  const resources = Object.values(world.tenant.resources)
    .filter(r => azure.parentResourceId(r.id) === null && azure.sameName(azure.parseArmId(r.id)?.resourceGroupName ?? '', parsed?.resourceGroupName ?? '') && azure.parseArmId(r.id)?.subscriptionId === parsed?.subscriptionId)
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <>
      <Essentials {...props} />
      <h2 className="section-title">Resources</h2>
      {resources.length === 0 ? <p className="empty">No resources in this group yet.</p> : (
        <div className="grid-scroll">
          <table className="grid">
            <thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Location</th></tr></thead>
            <tbody>
              {resources.map(r => (
                <tr key={r.id}>
                  <td><Link as="button" onClick={() => navigate({ page: 'resource', id: r.id, section: 'overview' })}>{r.name}</Link></td>
                  <td>{typeLabel(r.type)}</td>
                  <td>{r.location === 'global' ? 'Global' : azure.regionDisplayName(r.location)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export const GROUP_SECTIONS: Record<string, SectionDef> = {
  overview: { Body: GroupOverview },
  deployments: { Body: ({ target }) => <DeploymentsPanel resourceGroupId={target.id} /> },
}

// ── Virtual machine (PORTAL-14) ────────────────────────────────────────────────────────────────

/** Power state from the runtime record (VM-7), not from the desired configuration. */
function PowerState({ vm }: { vm: Resource }) {
  const state = useGame(s => s.world.runtime[azure.armKey(vm.id)]?.powerState ?? null)
  const label = state ? state[0]?.toUpperCase() + state.slice(1) : 'Unknown'
  return (
    <p className={`power power-${state ?? 'unknown'}`}>
      <span className="power-led" aria-hidden="true" />
      Status: {label}
    </p>
  )
}

function VmOverview(props: SectionProps) {
  const vm = asResource(props.target)
  return (
    <>
      <PowerState vm={vm} />
      <Essentials {...props} />
      <SimulatedApp key={vm.id} vm={vm} />
    </>
  )
}

function VmNetworking({ target, world }: SectionProps) {
  const vm = asResource(target)
  const navigate = useGame(s => s.navigate)
  const nics = azure.networkInterfacesOf(vm).map(r => world.tenant.resources[azure.armKey(r.id)]).filter((n): n is Resource => !!n)
  if (nics.length === 0) return <p className="empty">No network interface is attached.</p>
  return (
    <>
      {nics.map(nic => {
        const config = azure.ipConfigurationsOf(nic)[0]
        return (
          <section key={nic.id} className="nic-card" aria-label={`Network interface ${nic.name}`}>
            <h2 className="section-title">Network interface: <ResourceLink id={nic.id} /></h2>
            <dl className="essentials-grid">
              <div className="essentials-row"><dt>Subnet</dt><dd><ResourceLink id={config?.properties.subnet.id ?? null} /></dd></div>
              <div className="essentials-row"><dt>Private IP address</dt><dd>{config?.properties.privateIPAddress}</dd></div>
              <div className="essentials-row"><dt>Public IP address</dt><dd><ResourceLink id={config?.properties.publicIPAddress?.id ?? null} /></dd></div>
              <div className="essentials-row"><dt>Network security group</dt><dd><ResourceLink id={azure.nicNsgId(nic)} /></dd></div>
            </dl>
            <Link as="button" onClick={() => navigate({ page: 'resource', id: nic.id, section: 'effectiveRules' })}>Effective security rules</Link>
          </section>
        )
      })}
    </>
  )
}

export const VM_SECTIONS: Record<string, SectionDef> = {
  overview: { Body: VmOverview },
  networking: { Body: VmNetworking },
  alerts: { Body: () => <AlertsPanel alertRuleIds={[]} /> },
  metrics: { Body: () => <MetricsPanel /> },
}

// ── Application Insights, availability tests, alert rules (PORTAL-15, PORTAL-17) ───────────────

const testsOf = (world: SectionProps['world'], component: Resource) =>
  of(world, azure.WEBTEST_TYPE).filter(t => azure.sameName(azure.webTestView(t).componentId ?? '', component.id))
const rulesOfTests = (world: SectionProps['world'], tests: Resource[]) =>
  of(world, azure.METRIC_ALERT_TYPE).filter(a => tests.some(t => azure.sameName(azure.metricAlertView(a).webTestId, t.id)))

export const COMPONENT_SECTIONS: Record<string, SectionDef> = {
  availability: {
    Commands: ({ target }) => <CreateButton label="Add Standard test" icon="add" guide="insights:addTest" request={{ kind: 'webTest', preset: { componentId: target.id } }} />,
    Body: ({ target }) => <AvailabilityPanel componentId={target.id} />,
  },
  alerts: { Body: ({ target, world }) => <AlertsPanel alertRuleIds={rulesOfTests(world, testsOf(world, asResource(target))).map(r => r.id)} /> },
}

const groupOf = (r: Resource) => {
  const parsed = azure.parseArmId(r.id)
  return `${parsed?.subscriptionId ?? ''}|${parsed?.resourceGroupName ?? ''}`
}

function webTestPreset(test: Resource): Record<string, string> {
  const view = azure.webTestView(test)
  return {
    mode: 'edit', group: groupOf(test), name: test.name, location: test.location, componentId: view.componentId ?? '', url: view.url,
    locations: view.locations.join(','), frequency: String(view.frequencyMs / 1000), timeout: String(view.timeoutMs / 1000),
    expectedStatus: String(view.expectedStatus), retries: String((test.properties as { RetryEnabled?: boolean }).RetryEnabled !== false), enabled: String(view.enabled),
  }
}

function alertRulePreset(rule: Resource): Record<string, string> {
  const view = azure.metricAlertView(rule)
  return {
    mode: 'edit', group: groupOf(rule), name: rule.name, webTestId: view.webTestId, failedLocationCount: String(view.failedLocationCount),
    severity: String(view.severity), evaluationFrequency: String(rule.properties.evaluationFrequency), windowSize: String(rule.properties.windowSize),
    autoMitigate: String(view.autoMitigate), enabled: String(view.enabled), description: view.description,
  }
}

function CreateButton({ label, request, icon, guide }: { label: string; request: { kind: string; preset?: Record<string, string> }; icon: 'add' | 'edit'; guide?: string }) {
  const startCreate = useGame(s => s.startCreate)
  return <ToolbarButton icon={icon === 'add' ? <Add20Regular /> : <Edit20Regular />} onClick={() => startCreate(request)} {...(guide ? { 'data-guide': guide } : {})}>{label}</ToolbarButton>
}

function WebTestCommands({ target, world }: SectionProps) {
  const test = asResource(target)
  const navigate = useGame(s => s.navigate)
  const componentId = azure.webTestView(test).componentId
  const hasRule = rulesOfTests(world, [test]).length > 0
  return (
    <>
      <CreateButton label="Edit" icon="edit" request={{ kind: 'webTest', preset: webTestPreset(test) }} />
      {!hasRule && <CreateButton label="Add alert rule" icon="add" guide="webtest:addAlert" request={{ kind: 'metricAlert', preset: { webTestId: test.id } }} />}
      {componentId && <ToolbarButton icon={<Open20Regular />} onClick={() => navigate({ page: 'resource', id: componentId, section: 'availability' })}>Availability results</ToolbarButton>}
    </>
  )
}

function AlertRuleOverview(props: SectionProps) {
  const active = useGame(s => azure.activeAlertOf(s.world, props.target.id))
  return (
    <>
      <p className={`alert-state ${active ? 'is-fired' : 'is-quiet'}`} role="status">
        {active ? `Fired: ${active.failedLocations.length} locations failing` : 'No alert fired'}
      </p>
      <Essentials {...props} />
    </>
  )
}

function AlertRuleCommands({ target }: SectionProps) {
  const navigate = useGame(s => s.navigate)
  return (
    <>
      <CreateButton label="Edit" icon="edit" request={{ kind: 'metricAlert', preset: alertRulePreset(asResource(target)) }} />
      <ToolbarButton icon={<Open20Regular />} onClick={() => navigate({ page: 'service', service: 'monitor', section: 'alerts' })}>Alerts</ToolbarButton>
    </>
  )
}

export const WEBTEST_SECTIONS: Record<string, SectionDef> = { overview: { Commands: WebTestCommands, Body: Essentials } }
export const ALERT_RULE_SECTIONS: Record<string, SectionDef> = { overview: { Commands: AlertRuleCommands, Body: AlertRuleOverview } }
