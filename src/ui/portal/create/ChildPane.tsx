import { useState, type ReactNode } from 'react'
import { Button, Checkbox, Field } from '@fluentui/react-components'
import { azure, type Refusal, type Resource, type World } from '../../../engine/index.ts'
import { useGame } from '../../gameContext.ts'
import { useStableWorld } from '../useStableWorld.ts'
import { RefusalNotice } from '../../RefusalNotice.tsx'
import { childCommand, initialChild, SERVICE_TAGS } from './childCommands.ts'
import type { Values } from './commands.ts'
import { FormSection, SelectField, SimNote, TextField, type Set } from './fields.tsx'

/**
 * A side pane form (spec §4): add or change a child resource where the portal does it, on its parent's page
 * (PORTAL-11 Add subnet, PORTAL-12 Add inbound security rule and + Associate, PORTAL-17 Add Standard test,
 * PORTAL-17s alert rule). The button validates the same command the engine runs, then sends it.
 */
export function ChildPane({ kind, preset }: { kind: string; preset: Record<string, string> }) {
  const world = useStableWorld()
  const check = useGame(s => s.check)
  const dispatch = useGame(s => s.dispatch)
  const close = useGame(s => s.closeContextPane)
  const targetId = kind === 'networkInterface' ? nicIdFrom(preset) : undefined
  const [values, setValues] = useState<Values>(() => initialChild(kind, preset, world, targetId))
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const set: Set = (k, v) => {
    setValues(prev => ({ ...prev, [k]: v }))
    setRefusal(null)
  }
  const editing = values.mode === 'edit'
  const submit = () => {
    const command = childCommand(kind, values, world)
    if (!command) return
    const refused = check(command)
    if (refused) return setRefusal(refused)
    const outcome = dispatch(command)
    if (outcome.status === 'refused') return setRefusal(outcome.refusal)
    close()
  }
  const form = FORMS[kind]
  if (!form) return <p className="empty">The simulator can't change this here.</p>
  return (
    <div className="child-pane">
      {form({ values, set, world, editing })}
      {refusal && <RefusalNotice refusal={refusal} />}
      <div className="pane-footer">
        <Button appearance="primary" onClick={submit} data-guide={`pane:${kind}:submit`}>{primaryLabel(kind, editing)}</Button>
        <Button onClick={close}>Cancel</Button>
      </div>
    </div>
  )
}

function nicIdFrom(preset: Record<string, string>): string {
  const [subscriptionId = '', resourceGroupName = ''] = (preset.group ?? '').split('|')
  return azure.resourceId(subscriptionId, resourceGroupName, azure.NIC_TYPE, preset.name ?? '')
}

/** Button names from Learn where it names them: Add (rule), Save (subnet, edits), OK (associate), Create (test). */
function primaryLabel(kind: string, editing: boolean): string {
  if (editing) return 'Save'
  switch (kind) {
    case 'securityRule': return 'Add'
    case 'subnet': return 'Save'
    case 'associateSubnet': return 'OK'
    default: return 'Create'
  }
}

interface FormProps {
  values: Values
  set: Set
  world: World
  editing: boolean
}

const of = (world: World, type: string): Resource[] =>
  Object.values(world.tenant.resources).filter(r => r.type.toLowerCase() === type.toLowerCase()).sort((a, b) => a.name.localeCompare(b.name))
const withNone = (rs: Resource[]): [string, string][] => [['', 'None'], ...rs.map(r => [r.id, r.name] as [string, string])]

const KINDS: [string, string][] = [['Any', 'Any'], ['IP Addresses', 'IP Addresses'], ['Service Tag', 'Service Tag']]
const TAGS: [string, string][] = SERVICE_TAGS.map(t => [t, t])

function AddressFields({ side, values, set }: { side: 'source' | 'destination'; values: Values; set: Set }) {
  const label = side === 'source' ? 'Source' : 'Destination'
  const type = values[`${side}Type`] ?? 'Any'
  return (
    <>
      <SelectField label={label} value={type} onChange={x => set(`${side}Type`, x)} options={KINDS} />
      {type === 'IP Addresses' && (
        <TextField label={`${label} IP addresses/CIDR ranges`} required value={values[side] ?? ''} onChange={x => set(side, x)} placeholder="203.0.113.10 or 10.40.1.0/24" />
      )}
      {type === 'Service Tag' && (
        <SelectField label={`${label} service tag`} value={values[`${side}Tag`] ?? ''} onChange={x => set(`${side}Tag`, x)} options={TAGS} />
      )}
    </>
  )
}

const FORMS: Record<string, (p: FormProps) => ReactNode> = {
  securityRule: ({ values, set, editing }) => (
    <FormSection>
      <AddressFields side="source" values={values} set={set} />
      <TextField label="Source port ranges" required value={values.sourcePortRange ?? ''} onChange={x => set('sourcePortRange', x)} hint="* means any port." />
      <AddressFields side="destination" values={values} set={set} />
      <TextField label="Destination port ranges" required value={values.destinationPortRange ?? ''} onChange={x => set('destinationPortRange', x)}
        placeholder="443" hint="A port, a range like 1024-65535, or *." />
      <SelectField label="Protocol" value={values.protocol ?? 'Tcp'} onChange={x => set('protocol', x)} options={[['*', 'Any'], ['Tcp', 'TCP'], ['Udp', 'UDP'], ['Icmp', 'ICMP']]} />
      <SelectField label="Action" value={values.access ?? 'Allow'} onChange={x => set('access', x)} options={[['Allow', 'Allow'], ['Deny', 'Deny']]} />
      <TextField label="Priority" required value={values.priority ?? ''} onChange={x => set('priority', x)}
        hint="100 to 4096. Lower numbers are processed first, and the first matching rule wins." />
      <TextField label="Name" required value={values.name ?? ''} onChange={x => set('name', x)} readOnly={editing} placeholder="Allow-HTTPS" />
      <TextField label="Description" value={values.description ?? ''} onChange={x => set('description', x)} />
      <SimNote>Service, My IP address and application security groups aren't modelled: enter ports and addresses directly.</SimNote>
    </FormSection>
  ),

  subnet: ({ values, set, world, editing }) => {
    const vnet = world.tenant.resources[azure.armKey(values.virtualNetworkId ?? '')]
    return (
      <FormSection>
        <TextField label="Name" required value={values.name ?? ''} onChange={x => set('name', x)} readOnly={editing} placeholder="snet-game" />
        <TextField label="Subnet address range" required value={values.addressPrefix ?? ''} onChange={x => set('addressPrefix', x)} placeholder="10.40.1.0/24"
          hint={`Inside ${vnet ? azure.addressPrefixesOf(vnet).join(', ') : 'the address space'}. Azure reserves the first four and the last address.`} />
        <SelectField label="Network security group" value={values.networkSecurityGroupId ?? ''} onChange={x => set('networkSecurityGroupId', x)} options={withNone(of(world, azure.NSG_TYPE))} />
      </FormSection>
    )
  },

  associateSubnet: ({ values, set, world }) => {
    const vnets = of(world, azure.VNET_TYPE)
    const subnets = of(world, azure.SUBNET_TYPE).filter(s => azure.sameName(azure.parentResourceId(s.id) ?? '', values.virtualNetworkId ?? ''))
    return (
      <FormSection>
        <SelectField label="Virtual network" required value={values.virtualNetworkId ?? ''} options={vnets.map(v => [v.id, `${v.name} (${azure.parseArmId(v.id)?.resourceGroupName ?? ''})`])}
          onChange={x => { set('virtualNetworkId', x); set('subnetId', of(world, azure.SUBNET_TYPE).find(s => azure.sameName(azure.parentResourceId(s.id) ?? '', x))?.id ?? '') }} />
        <SelectField label="Subnet" required value={values.subnetId ?? ''} onChange={x => set('subnetId', x)} options={subnets.map(s => [s.id, s.name])} />
        <p className="form-section-hint">A subnet can have zero or one network security group. In the simulator, associating this one replaces the subnet's current one.</p>
      </FormSection>
    )
  },

  webTest: ({ values, set, editing }) => {
    const chosen = (values.locations ?? '').split(',').filter(Boolean)
    const toggle = (id: string) => set('locations', (chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id]).join(','))
    return (
      <>
        <FormSection title="Basic Information">
          <TextField label="Test name" required value={values.name ?? ''} onChange={x => set('name', x)} readOnly={editing} placeholder="game-api-health" />
          <TextField label="URL" required value={values.url ?? ''} onChange={x => set('url', x)}
            hint="Must be reachable from the public internet. The simulator has no DNS, so use the public IP address." />
          <Checkbox label="Enable retries for availability test failures" checked={values.retries !== 'false'} onChange={(_, d) => set('retries', String(d.checked === true))} />
          <SelectField label="Test frequency" value={values.frequency ?? '300'} onChange={x => set('frequency', x)} options={azure.TEST_FREQUENCIES.map(f => [String(f), `${f / 60} minutes`])} />
          <Field label={`Test locations (${chosen.length} of ${azure.TEST_LOCATIONS.length})`} hint="Learn recommends at least five, to distinguish problems in your website from network issues.">
            <div className="check-grid">
              {azure.TEST_LOCATIONS.map(l => <Checkbox key={l.id} label={l.displayName} checked={chosen.includes(l.id)} onChange={() => toggle(l.id)} />)}
            </div>
          </Field>
        </FormSection>
        <FormSection title="Success criteria">
          <SelectField label="Test Timeout" value={values.timeout ?? '30'} onChange={x => set('timeout', x)} options={azure.TEST_TIMEOUTS.map(t => [String(t), `${t} seconds`])} />
          <TextField label="HTTP response" value={values.expectedStatus ?? '200'} onChange={x => set('expectedStatus', x)} hint="The status code counted as a success. 200 means a normal response." />
          {editing && <Checkbox label="Enabled" checked={values.enabled !== 'false'} onChange={(_, d) => set('enabled', String(d.checked === true))} />}
        </FormSection>
        <SimNote>
          Frequencies and timeouts are the simulator's options. Parse dependent requests, SSL checks and content match aren't modelled.
          {!editing && ' In the portal an alert rule is enabled with every new test; here you add the alert rule yourself on the test\'s page.'}
        </SimNote>
      </>
    )
  },

  metricAlert: ({ values, set, world, editing }) => {
    const test = world.tenant.resources[azure.armKey(values.webTestId ?? '')]
    const n = test ? azure.webTestView(test).locations.length : 0
    const minutes = (iso: string) => `${iso.replace(/^PT(\d+)M$/, '$1')} minute${iso === 'PT1M' ? '' : 's'}`
    return (
      <FormSection>
        <TextField label="Alert rule name" required value={values.name ?? ''} onChange={x => set('name', x)} readOnly={editing} placeholder="alert-game-api-availability" />
        <TextField label="Failed locations that fire the alert" required value={values.failedLocationCount ?? ''} onChange={x => set('failedLocationCount', x)}
          hint={n >= 5 ? `The test runs from ${n} locations. Learn recommends the number of locations minus 2 (${n - 2}).` : `The test runs from ${n} location${n === 1 ? '' : 's'}.`} />
        <SelectField label="Check every" value={values.evaluationFrequency ?? 'PT1M'} onChange={x => set('evaluationFrequency', x)} options={Object.keys(azure.EVALUATION_FREQUENCIES).map(k => [k, minutes(k)])} />
        <SelectField label="Look back" value={values.windowSize ?? 'PT5M'} onChange={x => set('windowSize', x)} options={Object.keys(azure.WINDOW_SIZES).map(k => [k, minutes(k)])} />
        <SelectField label="Severity" value={values.severity ?? '1'} onChange={x => set('severity', x)} options={[0, 1, 2, 3, 4].map(v => [String(v), `Sev ${v}`])} />
        <Checkbox label="Resolve automatically once the condition isn't met" checked={values.autoMitigate !== 'false'} onChange={(_, d) => set('autoMitigate', String(d.checked === true))} />
        {editing && <Checkbox label="Enabled" checked={values.enabled !== 'false'} onChange={(_, d) => set('enabled', String(d.checked === true))} />}
        <TextField label="Description" value={values.description ?? ''} onChange={x => set('description', x)} />
        <SimNote>The portal sets this up from Open Rules (Alerts) page; the simulator keeps it to one pane.</SimNote>
      </FormSection>
    )
  },

  networkInterface: ({ values, set, world }) => (
    <FormSection title="IP configuration">
      <p className="form-section-hint">Private IP address: {values.privateIPAddress} ({values.privateIPAllocationMethod})</p>
      <SelectField label="Public IP address" value={values.publicIPAddressId ?? ''} onChange={x => set('publicIPAddressId', x)} options={withNone(of(world, azure.PUBLIC_IP_TYPE))}
        hint="None disassociates it." />
      <p className="form-section-hint">The network security group is set on the network interface itself: Network security group in its menu.</p>
    </FormSection>
  ),
}
