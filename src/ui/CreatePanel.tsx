import { useId, useState, type ReactNode } from 'react'
import { azure, type Resource } from '../engine/index.ts'
import type { CreateRequest, PlayerCommand } from '../store/gameStore.ts'
import { useGame } from './gameContext.ts'
import { kindLabel, RESOURCE_KINDS } from './resourceKinds.ts'
import { ReviewCreate } from './ReviewCreate.tsx'

/** "Create a resource": pick a type, fill in the form, Review + create. Also edits (same name = update). */
export function CreatePanel({ request }: { request: CreateRequest }) {
  const startCreate = useGame(s => s.startCreate)
  if (request.kind === null) {
    return (
      <div className="create">
        <h2 className="pane-title">Create a resource</h2>
        <ul className="kind-list">
          {RESOURCE_KINDS.map(k => (
            <li key={k.kind}>
              <button type="button" className="kind" onClick={() => startCreate({ kind: k.kind })}>
                <span className="kind-label">{k.label}</span>
                <span className="kind-blurb">{k.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="form-actions">
          <button type="button" className="button" onClick={() => startCreate(null)}>Cancel</button>
        </div>
      </div>
    )
  }

  const preset = request.preset ?? {}
  const editing = preset.mode === 'edit'
  const form = (() => {
    switch (request.kind) {
      case 'resourceGroup': return <ResourceGroupForm />
      case 'virtualNetwork': return <VirtualNetworkForm />
      case 'subnet': return <SubnetForm preset={preset} />
      case 'networkSecurityGroup': return <NsgForm />
      case 'securityRule': return <SecurityRuleForm preset={preset} />
      case 'publicIp': return <PublicIpForm />
      case 'networkInterface': return <NicForm preset={preset} />
      case 'virtualMachine': return <VmForm />
      case 'workspace': return <WorkspaceForm />
      case 'component': return <ComponentForm />
      case 'webTest': return <WebTestForm preset={preset} />
      case 'metricAlert': return <MetricAlertForm preset={preset} />
      default: return <p className="empty">Unknown resource type.</p>
    }
  })()

  return (
    <div className="create" key={JSON.stringify(request)}>
      <p className="create-back">
        {!editing && <button type="button" className="link-button" onClick={() => startCreate({ kind: null })}>All resource types</button>}
      </p>
      <h2 className="pane-title">{editing ? `Edit ${kindLabel(request.kind).toLowerCase()}` : `Create ${kindLabel(request.kind).toLowerCase()}`}</h2>
      {form}
    </div>
  )
}

// ── Form parts ──────────────────────────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}

function TextField(props: { label: string; value: string; onChange: (v: string) => void; hint?: string; placeholder?: string; readOnly?: boolean }) {
  return (
    <Field label={props.label} {...(props.hint ? { hint: props.hint } : {})}>
      {id => (
        <input
          id={id} className="input" value={props.value} spellCheck={false} autoComplete="off"
          placeholder={props.placeholder} readOnly={props.readOnly} onChange={e => props.onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

function SelectField(props: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; hint?: string; disabled?: boolean }) {
  return (
    <Field label={props.label} {...(props.hint ? { hint: props.hint } : {})}>
      {id => (
        <select id={id} className="input" value={props.value} disabled={props.disabled} onChange={e => props.onChange(e.target.value)}>
          {props.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      )}
    </Field>
  )
}

const REGION_OPTIONS: [string, string][] = azure.REGIONS.map(r => [r.name, r.displayName])

function useTenant() {
  return useGame(s => s.world.tenant)
}

/** Resource groups as `subscriptionId|name` options. */
function useResourceGroupOptions(): [string, string][] {
  const tenant = useTenant()
  return Object.values(tenant.resourceGroups).map(g => {
    const parsed = azure.parseArmId(g.id)
    return [`${parsed?.subscriptionId ?? ''}|${g.name}`, g.name]
  })
}

function useResourcesOfType(type: string): Resource[] {
  const tenant = useTenant()
  return Object.values(tenant.resources).filter(r => r.type.toLowerCase() === type.toLowerCase())
}

/** "Name (resource group)" for a select option. */
const optionLabel = (r: Resource, extra = '') => `${r.name}${extra} · ${azure.parseArmId(r.id)?.resourceGroupName ?? ''}`

function NeedsFirst({ what }: { what: string }) {
  const startCreate = useGame(s => s.startCreate)
  return (
    <p className="empty">
      You need a {what.toLowerCase()} first.{' '}
      <button type="button" className="link-button" onClick={() => startCreate({ kind: RESOURCE_KINDS.find(k => k.label === what)?.kind ?? null })}>
        Create a {what.toLowerCase()}
      </button>
    </p>
  )
}

/** Resource group picker + name + region: the "Basics" every top-level resource starts with. */
function useBasics(defaultName: string) {
  const groups = useResourceGroupOptions()
  const [group, setGroup] = useState(groups[0]?.[0] ?? '')
  const [name, setName] = useState(defaultName)
  const [location, setLocation] = useState('westeurope')
  const [subscriptionId = '', resourceGroupName = ''] = group.split('|')
  const fields = (
    <>
      <SelectField label="Resource group" value={group} onChange={setGroup} options={groups} />
      <TextField label="Name" value={name} onChange={setName} />
      <SelectField label="Region" value={location} onChange={setLocation} options={REGION_OPTIONS} />
    </>
  )
  return { ready: groups.length > 0, fields, subscriptionId, resourceGroupName, name, location }
}

const regionName = (location: string) => azure.regionDisplayName(location)

// ── Forms ──────────────────────────────────────────────────────────────────────────────────────

function ResourceGroupForm() {
  const tenant = useTenant()
  const subscriptions = Object.values(tenant.subscriptions)
  const [subscriptionId, setSubscriptionId] = useState(subscriptions[0]?.subscriptionId ?? '')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('westeurope')
  const command: PlayerCommand = { type: 'arm/resourceGroups/write', payload: { subscriptionId, name, location } }
  return (
    <>
      <SelectField label="Subscription" value={subscriptionId} onChange={setSubscriptionId}
        options={subscriptions.map(s => [s.subscriptionId, s.displayName])} />
      <TextField label="Name" value={name} onChange={setName} placeholder="rg-pixelforge-prod" />
      <SelectField label="Region" value={location} onChange={setLocation} options={REGION_OPTIONS}
        hint="Where the group's metadata is stored. Resources inside can be in other regions." />
      <ReviewCreate command={command} targetId={null}
        summary={[['Name', name], ['Region', regionName(location)]]} />
    </>
  )
}

function VirtualNetworkForm() {
  const basics = useBasics('')
  const [prefix, setPrefix] = useState('10.0.0.0/16')
  if (!basics.ready) return <NeedsFirst what="Resource group" />
  const payload = { subscriptionId: basics.subscriptionId, resourceGroupName: basics.resourceGroupName, name: basics.name, location: basics.location, addressPrefixes: [prefix] }
  return (
    <>
      {basics.fields}
      <TextField label="Address space" value={prefix} onChange={setPrefix}
        hint="One CIDR block from a private range, e.g. 10.40.0.0/16. Subnets are carved out of it." />
      <ReviewCreate command={{ type: 'arm/virtualNetworks/write', payload }}
        targetId={azure.resourceId(basics.subscriptionId, basics.resourceGroupName, azure.VNET_TYPE, basics.name)}
        summary={[['Name', basics.name], ['Resource group', basics.resourceGroupName], ['Region', regionName(basics.location)], ['Address space', prefix]]} />
    </>
  )
}

const NONE = ''

function SubnetForm({ preset }: { preset: Record<string, string> }) {
  const vnets = useResourcesOfType(azure.VNET_TYPE)
  const nsgs = useResourcesOfType(azure.NSG_TYPE)
  const editing = preset.mode === 'edit'
  const [vnetId, setVnetId] = useState(preset.virtualNetworkId ?? vnets[0]?.id ?? '')
  const [name, setName] = useState(preset.name ?? '')
  const [prefix, setPrefix] = useState(preset.addressPrefix ?? '')
  const [nsgId, setNsgId] = useState(preset.networkSecurityGroupId ?? NONE)
  if (vnets.length === 0) return <NeedsFirst what="Virtual network" />
  const vnet = vnets.find(v => v.id === vnetId)
  const block = azure.addressPrefixesOf(vnet ?? vnets[0]!).join(', ')
  const payload = { virtualNetworkId: vnetId, name, addressPrefix: prefix, networkSecurityGroupId: nsgId === NONE ? null : nsgId }
  const nsgName = nsgs.find(n => n.id === nsgId)?.name ?? 'None'
  return (
    <>
      <SelectField label="Virtual network" value={vnetId} onChange={setVnetId} disabled={editing}
        options={vnets.map(v => [v.id, optionLabel(v)])} />
      <TextField label="Name" value={name} onChange={setName} readOnly={editing} />
      <TextField label="Address range" value={prefix} onChange={setPrefix} placeholder="10.40.1.0/24"
        hint={`Inside ${block}. Azure reserves the first four and the last address.`} />
      <SelectField label="Network security group" value={nsgId} onChange={setNsgId}
        options={[[NONE, 'None'], ...nsgs.map(n => [n.id, optionLabel(n)] as [string, string])]} />
      <ReviewCreate command={{ type: 'arm/subnets/write', payload }} verb={editing ? 'Save' : 'Create'}
        targetId={`${vnetId}/subnets/${name}`}
        summary={[['Name', name], ['Virtual network', vnet?.name ?? ''], ['Address range', prefix], ['Network security group', nsgName]]} />
    </>
  )
}

function NsgForm() {
  const basics = useBasics('')
  if (!basics.ready) return <NeedsFirst what="Resource group" />
  const payload = { subscriptionId: basics.subscriptionId, resourceGroupName: basics.resourceGroupName, name: basics.name, location: basics.location }
  return (
    <>
      {basics.fields}
      <p className="field-hint">It starts with Azure's six default rules. Add your own rules after it's created.</p>
      <ReviewCreate command={{ type: 'arm/networkSecurityGroups/write', payload }}
        targetId={azure.resourceId(basics.subscriptionId, basics.resourceGroupName, azure.NSG_TYPE, basics.name)}
        summary={[['Name', basics.name], ['Resource group', basics.resourceGroupName], ['Region', regionName(basics.location)]]} />
    </>
  )
}

const PROTOCOLS: [string, string][] = [['Tcp', 'TCP'], ['Udp', 'UDP'], ['Icmp', 'ICMP'], ['*', 'Any'], ['Esp', 'ESP'], ['Ah', 'AH']]

function SecurityRuleForm({ preset }: { preset: Record<string, string> }) {
  const nsgs = useResourcesOfType(azure.NSG_TYPE)
  const editing = preset.mode === 'edit'
  const [nsgId, setNsgId] = useState(preset.networkSecurityGroupId ?? nsgs[0]?.id ?? '')
  const [name, setName] = useState(preset.name ?? '')
  const [priority, setPriority] = useState(preset.priority ?? '100')
  const [direction, setDirection] = useState(preset.direction ?? 'Inbound')
  const [access, setAccess] = useState(preset.access ?? 'Allow')
  const [protocol, setProtocol] = useState(preset.protocol ?? 'Tcp')
  const [source, setSource] = useState(preset.sourceAddressPrefix ?? '*')
  const [sourcePorts, setSourcePorts] = useState(preset.sourcePortRange ?? '*')
  const [destination, setDestination] = useState(preset.destinationAddressPrefix ?? '*')
  const [destinationPorts, setDestinationPorts] = useState(preset.destinationPortRange ?? '')
  const [description, setDescription] = useState(preset.description ?? '')
  if (nsgs.length === 0) return <NeedsFirst what="Network security group" />

  const properties = {
    priority: Number(priority), direction, access, protocol,
    sourceAddressPrefix: source, sourcePortRange: sourcePorts, destinationAddressPrefix: destination, destinationPortRange: destinationPorts,
    ...(description ? { description } : {}),
  }
  const nsgName = nsgs.find(n => n.id === nsgId)?.name ?? ''
  return (
    <>
      <SelectField label="Network security group" value={nsgId} onChange={setNsgId} disabled={editing}
        options={nsgs.map(n => [n.id, optionLabel(n)])} />
      <TextField label="Name" value={name} onChange={setName} readOnly={editing} placeholder="Allow-HTTPS" />
      <TextField label="Priority" value={priority} onChange={setPriority}
        hint="100 to 4096. Lower numbers are processed first, and the first matching rule wins." />
      <div className="field-row">
        <SelectField label="Direction" value={direction} onChange={setDirection} options={[['Inbound', 'Inbound'], ['Outbound', 'Outbound']]} />
        <SelectField label="Action" value={access} onChange={setAccess} options={[['Allow', 'Allow'], ['Deny', 'Deny']]} />
      </div>
      <SelectField label="Protocol" value={protocol} onChange={setProtocol} options={PROTOCOLS} />
      <TextField label="Source" value={source} onChange={setSource}
        hint="*, an IP address, a CIDR block, or a service tag: Internet, VirtualNetwork, AzureLoadBalancer." />
      <TextField label="Source port ranges" value={sourcePorts} onChange={setSourcePorts} hint="Usually * : clients pick random source ports." />
      <TextField label="Destination" value={destination} onChange={setDestination} />
      <TextField label="Destination port ranges" value={destinationPorts} onChange={setDestinationPorts} placeholder="443" hint="A port, a range like 1024-65535, or *." />
      <TextField label="Description (optional)" value={description} onChange={setDescription} />
      <ReviewCreate
        command={{ type: 'arm/securityRules/write', payload: { networkSecurityGroupId: nsgId, name, properties } }}
        verb={editing ? 'Save' : 'Create'}
        targetId={`${nsgId}/securityRules/${name}`}
        summary={[
          ['Network security group', nsgName], ['Name', name], ['Priority', priority],
          ['Rule', `${access} ${direction.toLowerCase()} ${PROTOCOLS.find(p => p[0] === protocol)?.[1] ?? protocol}`],
          ['From', `${source} port ${sourcePorts}`], ['To', `${destination} port ${destinationPorts}`],
        ]}
      />
    </>
  )
}

function PublicIpForm() {
  const basics = useBasics('')
  if (!basics.ready) return <NeedsFirst what="Resource group" />
  const payload = {
    subscriptionId: basics.subscriptionId, resourceGroupName: basics.resourceGroupName, name: basics.name, location: basics.location,
    sku: { name: 'Standard', tier: 'Regional' }, publicIPAllocationMethod: 'Static', publicIPAddressVersion: 'IPv4',
  }
  return (
    <>
      {basics.fields}
      <dl className="facts">
        <div><dt>SKU</dt><dd>Standard (Basic was retired in September 2025)</dd></div>
        <div><dt>Assignment</dt><dd>Static, IPv4</dd></div>
      </dl>
      <p className="field-hint">Closed to inbound traffic until a network security group allows it.</p>
      <ReviewCreate command={{ type: 'arm/publicIPAddresses/write', payload }}
        targetId={azure.resourceId(basics.subscriptionId, basics.resourceGroupName, azure.PUBLIC_IP_TYPE, basics.name)}
        summary={[['Name', basics.name], ['Resource group', basics.resourceGroupName], ['Region', regionName(basics.location)], ['SKU', 'Standard']]} />
    </>
  )
}

function NicForm({ preset }: { preset: Record<string, string> }) {
  const editing = preset.mode === 'edit'
  const groups = useResourceGroupOptions()
  const subnets = useResourcesOfType(azure.SUBNET_TYPE)
  const pips = useResourcesOfType(azure.PUBLIC_IP_TYPE)
  const nsgs = useResourcesOfType(azure.NSG_TYPE)
  const vnets = useResourcesOfType(azure.VNET_TYPE)
  const vnetName = (subnet: Resource) => vnets.find(v => azure.sameName(v.id, azure.parentResourceId(subnet.id) ?? ''))?.name ?? ''
  const [group, setGroup] = useState(preset.group ?? groups[0]?.[0] ?? '')
  const [name, setName] = useState(preset.name ?? '')
  const [location, setLocation] = useState(preset.location ?? 'westeurope')
  const [subnetId, setSubnetId] = useState(preset.subnetId ?? subnets[0]?.id ?? '')
  const [method, setMethod] = useState(preset.privateIPAllocationMethod ?? 'Dynamic')
  const [address, setAddress] = useState(preset.privateIPAddress ?? '')
  const [pipId, setPipId] = useState(preset.publicIPAddressId ?? NONE)
  const [nsgId, setNsgId] = useState(preset.networkSecurityGroupId ?? NONE)
  if (groups.length === 0) return <NeedsFirst what="Resource group" />
  if (subnets.length === 0) return <NeedsFirst what="Subnet" />
  const [subscriptionId = '', resourceGroupName = ''] = group.split('|')

  const payload = {
    subscriptionId, resourceGroupName, name, location, subnetId,
    privateIPAllocationMethod: method,
    ...(method === 'Static' ? { privateIPAddress: address } : {}),
    publicIPAddressId: pipId === NONE ? null : pipId,
    networkSecurityGroupId: nsgId === NONE ? null : nsgId,
  }
  const subnet = subnets.find(s => s.id === subnetId)
  return (
    <>
      <SelectField label="Resource group" value={group} onChange={setGroup} options={groups} disabled={editing} />
      <TextField label="Name" value={name} onChange={setName} readOnly={editing} />
      <SelectField label="Region" value={location} onChange={setLocation} options={REGION_OPTIONS} disabled={editing}
        hint="Must match the region of the subnet's virtual network." />
      <SelectField label="Subnet" value={subnetId} onChange={setSubnetId} disabled={editing}
        options={subnets.map(s => [s.id, `${vnetName(s)}/${s.name} (${String(s.properties.addressPrefix)})`])} />
      <SelectField label="Private IP address" value={method} onChange={setMethod} disabled={editing}
        options={[['Dynamic', 'Dynamic: Azure picks the next free address'], ['Static', 'Static: you choose the address']]} />
      {method === 'Static' && (
        <TextField label="Static address" value={address} onChange={setAddress} readOnly={editing}
          hint={`A free address in ${String(subnet?.properties.addressPrefix ?? 'the subnet')}, not one of the five Azure reserves.`} />
      )}
      <SelectField label="Public IP address" value={pipId} onChange={setPipId}
        options={[[NONE, 'None'], ...pips.map(p => [p.id, optionLabel(p, ` (${String(p.properties.ipAddress)})`)] as [string, string])]} />
      <SelectField label="Network security group" value={nsgId} onChange={setNsgId}
        options={[[NONE, 'None'], ...nsgs.map(n => [n.id, optionLabel(n)] as [string, string])]}
        hint="Optional. Inbound traffic must be allowed by the subnet's NSG and this one." />
      <ReviewCreate command={{ type: 'arm/networkInterfaces/write', payload }} verb={editing ? 'Save' : 'Create'}
        targetId={azure.resourceId(subscriptionId, resourceGroupName, azure.NIC_TYPE, name)}
        summary={[
          ['Name', name], ['Subnet', subnet?.name ?? ''], ['Private IP', method === 'Static' ? address : 'Dynamic'],
          ['Public IP', pips.find(p => p.id === pipId)?.name ?? 'None'], ['Network security group', nsgs.find(n => n.id === nsgId)?.name ?? 'None'],
        ]} />
    </>
  )
}

function VmForm() {
  const basics = useBasics('')
  const nics = useResourcesOfType(azure.NIC_TYPE)
  const vms = useResourcesOfType(azure.VM_TYPE)
  const free = nics.filter(n => !vms.some(vm => azure.networkInterfacesOf(vm).some(r => azure.sameName(r.id, n.id))))
  const [size, setSize] = useState<string>('Standard_B2s_v2')
  const [disk, setDisk] = useState<string>('StandardSSD_LRS')
  const [username, setUsername] = useState('')
  const [nicId, setNicId] = useState(free[0]?.id ?? '')
  if (!basics.ready) return <NeedsFirst what="Resource group" />
  if (nics.length === 0) return <NeedsFirst what="Network interface" />
  const payload = {
    subscriptionId: basics.subscriptionId, resourceGroupName: basics.resourceGroupName, name: basics.name, location: basics.location,
    vmSize: size, image: 'Ubuntu2204', osDiskType: disk, adminUsername: username, networkInterfaceId: nicId,
  }
  const sizeLabel = (s: (typeof azure.VM_SIZES)[number]) => `${s.name} (${s.vCpus} vCPUs, ${s.memoryGiB} GiB)`
  return (
    <>
      {basics.fields}
      <dl className="facts">
        <div><dt>Image</dt><dd>{azure.IMAGES.Ubuntu2204.displayName}</dd></div>
        <div><dt>Authentication</dt><dd>SSH public key (a simulated key pair)</dd></div>
      </dl>
      <SelectField label="Size" value={size} onChange={setSize} options={azure.VM_SIZES.map(s => [s.name, sizeLabel(s)])}
        hint="Bsv2 sizes are burstable: they earn CPU credits while idle and spend them under load." />
      <SelectField label="OS disk type" value={disk} onChange={setDisk} options={azure.OS_DISK_TYPES.map(t => [t.sku, `${t.displayName} (${t.sku})`])} />
      <TextField label="Administrator username" value={username} onChange={setUsername} placeholder="pixelops"
        hint="1 to 32 characters. Names like admin, root or test aren't allowed." />
      <SelectField label="Network interface" value={nicId} onChange={setNicId}
        options={free.length ? free.map(n => [n.id, optionLabel(n)]) : [['', 'All network interfaces are in use']]}
        hint="Its subnet and public IP decide how the VM is reached. It must be in the VM's region." />
      <ReviewCreate command={{ type: 'arm/virtualMachines/write', payload }}
        targetId={azure.resourceId(basics.subscriptionId, basics.resourceGroupName, azure.VM_TYPE, basics.name)}
        summary={[
          ['Name', basics.name], ['Region', regionName(basics.location)], ['Image', azure.IMAGES.Ubuntu2204.displayName],
          ['Size', size], ['OS disk', azure.OS_DISK_TYPES.find(t => t.sku === disk)?.displayName ?? disk],
          ['Network interface', nics.find(n => n.id === nicId)?.name ?? ''],
        ]} />
    </>
  )
}

// ── Monitoring (step 8b) ───────────────────────────────────────────────────────────────────────

function WorkspaceForm() {
  const basics = useBasics('')
  if (!basics.ready) return <NeedsFirst what="Resource group" />
  const payload = { subscriptionId: basics.subscriptionId, resourceGroupName: basics.resourceGroupName, name: basics.name, location: basics.location }
  return (
    <>
      {basics.fields}
      <dl className="facts">
        <div><dt>Pricing tier</dt><dd>PerGB2018 (pay per GB ingested)</dd></div>
        <div><dt>Retention</dt><dd>30 days by default; Application Insights tables keep 90 days</dd></div>
      </dl>
      <p className="field-hint">4 to 63 letters, numbers and hyphens, e.g. log-pixelforge-prod.</p>
      <ReviewCreate command={{ type: 'arm/workspaces/write', payload }}
        targetId={azure.resourceId(basics.subscriptionId, basics.resourceGroupName, azure.WORKSPACE_TYPE, basics.name)}
        summary={[['Name', basics.name], ['Resource group', basics.resourceGroupName], ['Region', regionName(basics.location)], ['Pricing tier', 'PerGB2018']]} />
    </>
  )
}

function ComponentForm() {
  const basics = useBasics('')
  const workspaces = useResourcesOfType(azure.WORKSPACE_TYPE)
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? '')
  if (!basics.ready) return <NeedsFirst what="Resource group" />
  if (workspaces.length === 0) return <NeedsFirst what="Log Analytics workspace" />
  const payload = { subscriptionId: basics.subscriptionId, resourceGroupName: basics.resourceGroupName, name: basics.name, location: basics.location, workspaceResourceId: workspaceId }
  return (
    <>
      {basics.fields}
      <SelectField label="Log Analytics workspace" value={workspaceId} onChange={setWorkspaceId}
        options={workspaces.map(w => [w.id, optionLabel(w)])}
        hint="Application Insights sends its telemetry here. Classic, workspace-less resources are retired." />
      <ReviewCreate command={{ type: 'arm/components/write', payload }}
        targetId={azure.resourceId(basics.subscriptionId, basics.resourceGroupName, azure.COMPONENT_TYPE, basics.name)}
        summary={[['Name', basics.name], ['Region', regionName(basics.location)], ['Application type', 'Web'], ['Workspace', workspaces.find(w => w.id === workspaceId)?.name ?? '']]} />
    </>
  )
}

/** Five locations, so a 5-minute test runs about once a minute (MON-2). */
const DEFAULT_LOCATIONS = ['emea-nl-ams-azr', 'emea-gb-db3-azr', 'emea-fr-pra-edge', 'emea-ru-msa-edge', 'emea-se-sto-edge']

function WebTestForm({ preset }: { preset: Record<string, string> }) {
  const editing = preset.mode === 'edit'
  const groups = useResourceGroupOptions()
  const components = useResourcesOfType(azure.COMPONENT_TYPE)
  const pips = useResourcesOfType(azure.PUBLIC_IP_TYPE)
  const [group, setGroup] = useState(preset.group ?? groups[0]?.[0] ?? '')
  const [name, setName] = useState(preset.name ?? '')
  const [location, setLocation] = useState(preset.location ?? 'westeurope')
  const [componentId, setComponentId] = useState(preset.componentId ?? components[0]?.id ?? '')
  const [url, setUrl] = useState(preset.url ?? (pips[0] ? `https://${String(pips[0].properties.ipAddress)}/health` : 'https://'))
  const [locations, setLocations] = useState<string[]>(preset.locations ? preset.locations.split(',') : DEFAULT_LOCATIONS)
  const [frequency, setFrequency] = useState(preset.frequency ?? '300')
  const [timeout, setTimeoutValue] = useState(preset.timeout ?? '30')
  const [status, setStatus] = useState(preset.expectedStatus ?? '200')
  const [retries, setRetries] = useState(preset.retries !== 'false')
  const [enabled, setEnabled] = useState(preset.enabled !== 'false')
  const legendId = useId()
  if (groups.length === 0) return <NeedsFirst what="Resource group" />
  if (components.length === 0) return <NeedsFirst what="Application Insights" />
  const [subscriptionId = '', resourceGroupName = ''] = group.split('|')
  const toggle = (id: string) => setLocations(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]))

  const payload = {
    subscriptionId, resourceGroupName, name, location, componentId,
    settings: {
      Enabled: enabled, Frequency: Number(frequency), Timeout: Number(timeout), RetryEnabled: retries,
      Locations: azure.TEST_LOCATIONS.map(l => l.id).filter(id => locations.includes(id)), RequestUrl: url, ExpectedHttpStatusCode: Number(status),
    },
  }
  return (
    <>
      <SelectField label="Resource group" value={group} onChange={setGroup} options={groups} disabled={editing} />
      <TextField label="Name" value={name} onChange={setName} readOnly={editing} placeholder="game-api-health" />
      <SelectField label="Region" value={location} onChange={setLocation} options={REGION_OPTIONS} disabled={editing} />
      <SelectField label="Application Insights" value={componentId} onChange={setComponentId} disabled={editing}
        options={components.map(c => [c.id, optionLabel(c)])} hint="The test is linked to it with a hidden-link tag." />
      <TextField label="URL" value={url} onChange={setUrl}
        hint="Must be reachable from the public internet. The simulator has no DNS, so use the public IP address." />
      <fieldset className="field check-list" aria-describedby={legendId}>
        <legend>Test locations ({locations.length} of 16)</legend>
        {azure.TEST_LOCATIONS.map(l => (
          <label key={l.id} className="check">
            <input type="checkbox" checked={locations.includes(l.id)} onChange={() => toggle(l.id)} />
            <span>{l.displayName}</span>
          </label>
        ))}
        <p id={legendId} className="field-hint">At least five are recommended, so a problem near one location doesn't look like an outage.</p>
      </fieldset>
      <div className="field-row">
        <SelectField label="Test frequency" value={frequency} onChange={setFrequency}
          options={azure.TEST_FREQUENCIES.map(f => [String(f), `${f / 60} minutes`])} />
        <SelectField label="Test timeout" value={timeout} onChange={setTimeoutValue}
          options={azure.TEST_TIMEOUTS.map(t => [String(t), `${t} seconds`])} />
      </div>
      <TextField label="Expected HTTP status code" value={status} onChange={setStatus} hint="200 means a normal response." />
      <label className="check"><input type="checkbox" checked={retries} onChange={e => setRetries(e.target.checked)} /><span>Retry failed tests</span></label>
      {editing && <label className="check"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /><span>Enabled</span></label>}
      {!editing && <p className="field-hint">In the portal an alert rule is turned on with every new test. Here you create the alert rule yourself next.</p>}
      <ReviewCreate command={{ type: 'arm/webtests/write', payload }} verb={editing ? 'Save' : 'Create'}
        targetId={azure.resourceId(subscriptionId, resourceGroupName, azure.WEBTEST_TYPE, name)}
        summary={[
          ['Name', name], ['URL', url], ['Locations', String(locations.length)],
          ['Every', `${Number(frequency) / 60} minutes`], ['Success', `HTTP ${status} within ${timeout} s`], ['Enabled', enabled ? 'Yes' : 'No'],
        ]} />
    </>
  )
}

function MetricAlertForm({ preset }: { preset: Record<string, string> }) {
  const editing = preset.mode === 'edit'
  const groups = useResourceGroupOptions()
  const tests = useResourcesOfType(azure.WEBTEST_TYPE)
  const [group, setGroup] = useState(preset.group ?? groups[0]?.[0] ?? '')
  const [name, setName] = useState(preset.name ?? '')
  const [testId, setTestId] = useState(preset.webTestId ?? tests[0]?.id ?? '')
  const test = tests.find(t => t.id === testId)
  const n = test ? azure.webTestView(test).locations.length : 5
  const [failed, setFailed] = useState(preset.failedLocationCount ?? String(Math.max(1, n - 2)))
  const [severity, setSeverity] = useState(preset.severity ?? '1')
  const [evaluation, setEvaluation] = useState(preset.evaluationFrequency ?? 'PT1M')
  const [windowSize, setWindowSize] = useState(preset.windowSize ?? 'PT5M')
  const [autoMitigate, setAutoMitigate] = useState(preset.autoMitigate !== 'false')
  const [enabled, setEnabled] = useState(preset.enabled !== 'false')
  const [description, setDescription] = useState(preset.description ?? '')
  if (groups.length === 0) return <NeedsFirst what="Resource group" />
  if (tests.length === 0) return <NeedsFirst what="Availability test" />
  const [subscriptionId = '', resourceGroupName = ''] = group.split('|')
  const payload = {
    subscriptionId, resourceGroupName, name, webTestId: testId, severity: Number(severity), enabled,
    evaluationFrequency: evaluation, windowSize, failedLocationCount: Number(failed), autoMitigate, ...(description ? { description } : {}),
  }
  const minutesLabel = (iso: string) => `${iso.replace(/^PT(\d+)M$/, '$1')} minute${iso === 'PT1M' ? '' : 's'}`
  return (
    <>
      <SelectField label="Resource group" value={group} onChange={setGroup} options={groups} disabled={editing} />
      <TextField label="Name" value={name} onChange={setName} readOnly={editing} placeholder="alert-game-api-availability" />
      <SelectField label="Availability test" value={testId} onChange={setTestId} disabled={editing} options={tests.map(t => [t.id, optionLabel(t)])} />
      <TextField label="Failed locations that fire the alert" value={failed} onChange={setFailed}
        hint={`The test runs from ${n} location${n === 1 ? '' : 's'}. Recommended: the number of locations minus 2 (${Math.max(1, n - 2)}).`} />
      <div className="field-row">
        <SelectField label="Check every" value={evaluation} onChange={setEvaluation} options={Object.keys(azure.EVALUATION_FREQUENCIES).map(k => [k, minutesLabel(k)])} />
        <SelectField label="Look back" value={windowSize} onChange={setWindowSize} options={Object.keys(azure.WINDOW_SIZES).map(k => [k, minutesLabel(k)])} />
      </div>
      <SelectField label="Severity" value={severity} onChange={setSeverity} options={[0, 1, 2, 3, 4].map(v => [String(v), `Sev ${v}`])} />
      <label className="check"><input type="checkbox" checked={autoMitigate} onChange={e => setAutoMitigate(e.target.checked)} /><span>Resolve automatically when the test recovers</span></label>
      {editing && <label className="check"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /><span>Enabled</span></label>}
      <TextField label="Description (optional)" value={description} onChange={setDescription} />
      <ReviewCreate command={{ type: 'arm/metricAlerts/write', payload }} verb={editing ? 'Save' : 'Create'}
        targetId={azure.resourceId(subscriptionId, resourceGroupName, azure.METRIC_ALERT_TYPE, name)}
        summary={[
          ['Name', name], ['Test', test?.name ?? ''], ['Fires when', `${failed} of ${n} locations fail`],
          ['Checked', `every ${minutesLabel(evaluation)} over ${minutesLabel(windowSize)}`], ['Severity', `Sev ${severity}`],
        ]} />
    </>
  )
}
