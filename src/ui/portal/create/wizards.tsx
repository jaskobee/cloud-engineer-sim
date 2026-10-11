import type { ReactNode } from 'react'
import { azure, type Resource, type World } from '../../../engine/index.ts'
import type { Values } from './commands.ts'
import { FixedField, FormSection, initialProject, ProjectDetails, REGION_OPTIONS, SelectField, SimNote, TextField, type Set } from './fields.tsx'

/**
 * The create wizards (PORTAL-6, PORTAL-7, PORTAL-7s): tab names from Learn, fields the simulator models.
 * Tabs whose settings the simulator doesn't model are left out (PORTAL-6s). Commands come from commands.ts.
 */
export interface WizardTab {
  id: string
  label: string
  rule: string
}

export interface TabProps {
  values: Values
  set: Set
  world: World
}

export interface WizardDef {
  /** No tab strip: Learn describes this create page as one screen (Create network interface, PORTAL-7). */
  singleScreen?: boolean
  tabs: WizardTab[]
  initial(world: World, preset: Record<string, string>): Values
  render(tab: string, props: TabProps): ReactNode
  summary(values: Values, world: World): [string, string][]
}

const BASICS: WizardTab = { id: 'basics', label: 'Basics', rule: 'PORTAL-6' }

const of = (world: World, type: string): Resource[] =>
  Object.values(world.tenant.resources).filter(r => r.type.toLowerCase() === type.toLowerCase()).sort((a, b) => a.name.localeCompare(b.name))
const region = (location: string) => azure.regionDisplayName(location)
const groupLabel = (values: Values) => `${values.resourceGroupName ?? ''}${values.newResourceGroup === 'true' ? ' (new)' : ''}`
const optionLabel = (r: Resource, extra = '') => `${r.name}${extra} (${azure.parseArmId(r.id)?.resourceGroupName ?? ''})`

/** Instance details with a name and a region: most Basics tabs. */
function NameAndRegion({ values, set, nameLabel, placeholder, regionHint }: TabProps & { nameLabel: string; placeholder: string; regionHint?: string }) {
  return (
    <FormSection title="Instance details">
      <TextField label={nameLabel} required value={values.name ?? ''} onChange={x => set('name', x)} placeholder={placeholder} />
      <SelectField label="Region" required value={values.location ?? 'westeurope'} onChange={x => set('location', x)} options={REGION_OPTIONS} {...(regionHint ? { hint: regionHint } : {})} />
    </FormSection>
  )
}

const basicSummary = (values: Values): [string, string][] => [
  ['Subscription', values.subscriptionId ?? ''], ['Resource group', groupLabel(values)], ['Name', values.name ?? ''], ['Region', region(values.location ?? '')],
]

export const WIZARDS: Record<string, WizardDef> = {
  resourceGroup: {
    tabs: [BASICS],
    initial: world => ({ subscriptionId: Object.values(world.tenant.subscriptions)[0]?.subscriptionId ?? '', name: '', location: 'westeurope' }),
    render: (_tab, { values, set, world }) => (
      <FormSection title="Project details">
        <SelectField label="Subscription" required value={values.subscriptionId ?? ''} onChange={x => set('subscriptionId', x)}
          options={Object.values(world.tenant.subscriptions).map(s => [s.subscriptionId, s.displayName])} />
        <TextField label="Resource group" required value={values.name ?? ''} onChange={x => set('name', x)} placeholder="rg-pixelforge-prod" />
        <SelectField label="Region" required value={values.location ?? 'westeurope'} onChange={x => set('location', x)} options={REGION_OPTIONS}
          hint="Where the group's metadata is stored. Resources inside can be in other regions." />
      </FormSection>
    ),
    summary: values => [['Resource group', values.name ?? ''], ['Region', region(values.location ?? '')]],
  },

  virtualNetwork: {
    tabs: [BASICS, { id: 'ipAddresses', label: 'IP Addresses', rule: 'PORTAL-7' }],
    initial: world => ({ ...initialProject(world), addressSpace: '10.0.0.0/16' }),
    render: (tab, props) => tab === 'basics'
      ? <><ProjectDetails {...props} /><NameAndRegion {...props} nameLabel="Name" placeholder="vnet-pixelforge-prod" /></>
      : (
        <FormSection title="IPv4 address space">
          <TextField label="IPv4 address space" required value={props.values.addressSpace ?? ''} onChange={x => props.set('addressSpace', x)}
            hint="One CIDR block from a private range, e.g. 10.40.0.0/16. Subnets are carved out of it." />
          <SimNote>Add subnets after the network exists (Subnets &gt; + Subnet). The Security tab isn't modelled.</SimNote>
        </FormSection>
      ),
    summary: values => [...basicSummary(values), ['Address space', values.addressSpace ?? '']],
  },

  networkSecurityGroup: {
    tabs: [BASICS],
    initial: world => initialProject(world),
    render: (_tab, props) => (
      <>
        <ProjectDetails {...props} />
        <NameAndRegion {...props} nameLabel="Network security group name" placeholder="nsg-snet-game" />
        <p className="form-section-hint">It starts with Azure's six default rules. Add your own rules after it's created.</p>
      </>
    ),
    summary: values => basicSummary(values),
  },

  publicIp: {
    tabs: [BASICS],
    initial: world => initialProject(world),
    render: (_tab, props) => (
      <>
        <ProjectDetails {...props} />
        <FormSection title="Instance details">
          <SelectField label="Region" required value={props.values.location ?? 'westeurope'} onChange={x => props.set('location', x)} options={REGION_OPTIONS} />
        </FormSection>
        <FormSection title="Configuration details">
          <TextField label="Name" required value={props.values.name ?? ''} onChange={x => props.set('name', x)} placeholder="pip-game-01" />
          <FixedField label="IP Version" value="IPv4" />
          <FixedField label="SKU" value="Standard" hint="Basic was retired in September 2025." />
          <FixedField label="Tier" value="Regional" />
          <FixedField label="IP address assignment" value="Static" />
          <p className="form-section-hint">Closed to inbound traffic until a network security group allows it.</p>
        </FormSection>
      </>
    ),
    summary: values => [...basicSummary(values), ['SKU', 'Standard'], ['IP address assignment', 'Static']],
  },

  networkInterface: {
    singleScreen: true,
    tabs: [BASICS],
    initial: world => {
      const subnet = of(world, azure.SUBNET_TYPE)[0]
      return { ...initialProject(world), virtualNetworkId: subnet ? azure.parentResourceId(subnet.id) ?? '' : '', subnetId: subnet?.id ?? '', privateIPAllocationMethod: 'Dynamic', privateIPAddress: '' }
    },
    render: (_tab, props) => {
      const { values, set, world } = props
      const vnets = of(world, azure.VNET_TYPE)
      const subnets = of(world, azure.SUBNET_TYPE).filter(s => azure.sameName(azure.parentResourceId(s.id) ?? '', values.virtualNetworkId ?? ''))
      const subnet = subnets.find(s => s.id === values.subnetId)
      return (
        <>
          <ProjectDetails {...props} />
          <NameAndRegion {...props} nameLabel="Name" placeholder="nic-game-01" regionHint="Must match the region of the virtual network." />
          <FormSection>
            <SelectField label="Virtual network" required value={values.virtualNetworkId ?? ''} options={vnets.map(n => [n.id, optionLabel(n)])}
              onChange={x => { set('virtualNetworkId', x); set('subnetId', of(world, azure.SUBNET_TYPE).find(s => azure.sameName(azure.parentResourceId(s.id) ?? '', x))?.id ?? '') }} />
            <SelectField label="Subnet" required value={values.subnetId ?? ''} onChange={x => set('subnetId', x)}
              options={subnets.map(s => [s.id, `${s.name} (${String(s.properties.addressPrefix)})`])} />
            <FixedField label="IP version" value="IPv4" />
            <SelectField label="Private IP address assignment" value={values.privateIPAllocationMethod ?? 'Dynamic'} onChange={x => set('privateIPAllocationMethod', x)}
              options={[['Dynamic', 'Dynamic'], ['Static', 'Static']]} hint="Dynamic: Azure picks the next free address. Static: you choose it." />
            {values.privateIPAllocationMethod === 'Static' && (
              <TextField label="Private IP address" required value={values.privateIPAddress ?? ''} onChange={x => set('privateIPAddress', x)}
                hint={`A free address in ${String(subnet?.properties.addressPrefix ?? 'the subnet')}, not one of the five Azure reserves.`} />
            )}
            <SimNote>Attach a public IP address under IP configurations and a network security group under Network security group once it exists, as in the portal.</SimNote>
          </FormSection>
        </>
      )
    },
    summary: (values, world) => [
      ...basicSummary(values),
      ['Subnet', world.tenant.resources[azure.armKey(values.subnetId ?? '')]?.name ?? ''],
      ['Private IP address assignment', values.privateIPAllocationMethod === 'Static' ? `Static (${values.privateIPAddress ?? ''})` : 'Dynamic'],
    ],
  },

  virtualMachine: {
    tabs: [BASICS, { id: 'disks', label: 'Disks', rule: 'PORTAL-7' }, { id: 'networking', label: 'Networking', rule: 'PORTAL-7' }],
    initial: world => {
      const vms = of(world, azure.VM_TYPE)
      const free = of(world, azure.NIC_TYPE).find(n => !vms.some(vm => azure.networkInterfacesOf(vm).some(r => azure.sameName(r.id, n.id))))
      return { ...initialProject(world), vmSize: 'Standard_B2s_v2', osDiskType: 'StandardSSD_LRS', adminUsername: '', networkInterfaceId: free?.id ?? '' }
    },
    render: (tab, props) => {
      const { values, set, world } = props
      if (tab === 'basics') {
        const sizeLabel = (s: (typeof azure.VM_SIZES)[number]) => `${s.name} (${s.vCpus} vCPUs, ${s.memoryGiB} GiB memory)`
        return (
          <>
            <ProjectDetails {...props} />
            <FormSection title="Instance details">
              <TextField label="Virtual machine name" required value={values.name ?? ''} onChange={x => set('name', x)} placeholder="vm-game-01" />
              <SelectField label="Region" required value={values.location ?? 'westeurope'} onChange={x => set('location', x)} options={REGION_OPTIONS} />
              <FixedField label="Image" value={azure.IMAGES.Ubuntu2204.displayName} />
              <SelectField label="Size" required value={values.vmSize ?? ''} onChange={x => set('vmSize', x)} options={azure.VM_SIZES.map(s => [s.name, sizeLabel(s)])}
                hint="Bsv2 sizes are burstable: they earn credits below their base CPU performance and spend them above it." />
            </FormSection>
            <FormSection title="Administrator account">
              <FixedField label="Authentication type" value="SSH public key" hint="The simulator uses a made-up key pair." />
              <TextField label="Username" required value={values.adminUsername ?? ''} onChange={x => set('adminUsername', x)} placeholder="pixelops"
                hint="1 to 32 characters. Names like admin, root or test aren't allowed." />
            </FormSection>
            <SimNote>Inbound port rules aren't set here in the simulator: allow traffic with a network security group.</SimNote>
          </>
        )
      }
      if (tab === 'disks') {
        return (
          <FormSection title="OS disk">
            <SelectField label="OS disk type" value={values.osDiskType ?? ''} onChange={x => set('osDiskType', x)}
              options={azure.OS_DISK_TYPES.map(t => [t.sku, `${t.displayName} (${t.sku})`])} />
          </FormSection>
        )
      }
      const vms = of(world, azure.VM_TYPE)
      const nics = of(world, azure.NIC_TYPE)
      const free = nics.filter(n => !vms.some(vm => azure.networkInterfacesOf(vm).some(r => azure.sameName(r.id, n.id))))
      return (
        <FormSection title="Network interface">
          <SimNote>In the portal this tab creates a new network interface from Virtual network, Subnet, Public IP and NIC network security group. In the simulator you attach one you created first.</SimNote>
          <SelectField label="Network interface" required value={values.networkInterfaceId ?? ''} onChange={x => set('networkInterfaceId', x)}
            options={free.length ? free.map(n => [n.id, optionLabel(n)]) : [['', 'No free network interface: create one first']]}
            hint="Its subnet and public IP decide how the VM is reached. It must be in the VM's region." />
        </FormSection>
      )
    },
    summary: (values, world) => [
      ...basicSummary(values), ['Image', azure.IMAGES.Ubuntu2204.displayName], ['Size', values.vmSize ?? ''],
      ['OS disk type', azure.OS_DISK_TYPES.find(t => t.sku === values.osDiskType)?.displayName ?? ''],
      ['Network interface', world.tenant.resources[azure.armKey(values.networkInterfaceId ?? '')]?.name ?? ''],
    ],
  },

  workspace: {
    tabs: [BASICS],
    initial: world => initialProject(world),
    render: (_tab, props) => (
      <>
        <ProjectDetails {...props} />
        <NameAndRegion {...props} nameLabel="Name" placeholder="log-pixelforge-prod" />
        {/* MON-30: new workspaces get a default pay-as-you-go pricing tier (the ARM SKU name is PerGB2018). */}
        <FixedField label="Pricing tier" value="Pay-as-you-go (PerGB2018)" />
        <p className="form-section-hint">4 to 63 letters, numbers and hyphens. Data is kept 30 days by default; Application Insights tables keep 90 days.</p>
      </>
    ),
    summary: values => [...basicSummary(values), ['Pricing tier', 'Pay-as-you-go (PerGB2018)']],
  },

  component: {
    tabs: [BASICS],
    initial: world => ({ ...initialProject(world), workspaceId: of(world, azure.WORKSPACE_TYPE)[0]?.id ?? '' }),
    render: (_tab, props) => (
      <>
        <ProjectDetails {...props} />
        <NameAndRegion {...props} nameLabel="Name" placeholder="appi-pixelforge-prod" />
        <FormSection>
          <SelectField label="Log Analytics workspace" required value={props.values.workspaceId ?? ''} onChange={x => props.set('workspaceId', x)}
            options={of(props.world, azure.WORKSPACE_TYPE).map(w => [w.id, optionLabel(w)])}
            hint="Application Insights sends its telemetry here. Classic, workspace-less resources are retired." />
        </FormSection>
      </>
    ),
    summary: (values, world) => [...basicSummary(values), ['Application type', 'Web'], ['Workspace', world.tenant.resources[azure.armKey(values.workspaceId ?? '')]?.name ?? '']],
  },
}
