import { useState } from 'react'
import { Badge, Button, Dropdown, Field, Link, Option, ToolbarButton } from '@fluentui/react-components'
import { Add20Regular, Delete20Regular } from '@fluentui/react-icons'
import { azure, type ArmId, type Refusal, type Resource } from '../../../engine/index.ts'
import { useGame } from '../../gameContext.ts'
import { EffectiveRulesPanel } from '../../NetworkWatcher.tsx'
import { RefusalNotice } from '../../RefusalNotice.tsx'
import { MapView } from '../MapView.tsx'
import { Essentials, LinkedList, ResourceLink } from './common.tsx'
import { asResource, type SectionDef, type SectionProps } from './types.ts'

const of = (world: SectionProps['world'], type: string) => Object.values(world.tenant.resources).filter(r => r.type.toLowerCase() === type.toLowerCase())
const childrenOf = (world: SectionProps['world'], parent: Resource, type: string) =>
  of(world, type).filter(r => azure.sameName(azure.parentResourceId(r.id) ?? '', parent.id))
const subnetNsg = (s: Resource) => (s.properties.networkSecurityGroup as { id?: string } | undefined)?.id ?? null

export const PROTOCOL_LABEL: Record<string, string> = { '*': 'Any', Tcp: 'TCP', Udp: 'UDP', Icmp: 'ICMP', Esp: 'ESP', Ah: 'AH' }

// ── Virtual network (PORTAL-11) ────────────────────────────────────────────────────────────────

function subnetPreset(vnet: Resource, s: Resource): Record<string, string> {
  return { mode: 'edit', virtualNetworkId: vnet.id, name: s.name, addressPrefix: String(s.properties.addressPrefix), networkSecurityGroupId: subnetNsg(s) ?? '' }
}

function VnetSubnets({ target, world }: SectionProps) {
  const vnet = asResource(target)
  const startCreate = useGame(s => s.startCreate)
  const subnets = childrenOf(world, vnet, azure.SUBNET_TYPE).sort((a, b) => a.name.localeCompare(b.name))
  if (subnets.length === 0) return <p className="empty">No subnets yet. Resources connect to a virtual network through a subnet.</p>
  return (
    <div className="grid-scroll">
      <table className="grid">
        <thead><tr><th scope="col">Name</th><th scope="col">IPv4</th><th scope="col">Available IPs</th><th scope="col">Network security group</th></tr></thead>
        <tbody>
          {subnets.map(s => {
            const block = azure.parseCidr(String(s.properties.addressPrefix))
            const used = of(world, azure.NIC_TYPE).filter(n => azure.ipConfigurationsOf(n).some(c => azure.sameName(c.properties.subnet.id, s.id))).length
            return (
              <tr key={s.id}>
                <td>
                  <Link as="button" onClick={() => startCreate({ kind: 'subnet', preset: subnetPreset(vnet, s) })} data-guide={`subnet:${s.name}`}>{s.name}</Link>
                  {s.provisioningState !== 'Succeeded' && <Badge appearance="tint" color="warning" size="small">{s.provisioningState}…</Badge>}
                </td>
                <td className="mono">{String(s.properties.addressPrefix)}</td>
                {/* Azure reserves five addresses in every subnet (SUB-2). */}
                <td>{block ? block.size - 5 - used : '?'}</td>
                <td><ResourceLink id={subnetNsg(s)} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function VnetAddressSpace({ target }: SectionProps) {
  const prefixes = azure.addressPrefixesOf(asResource(target))
  return (
    <table className="grid">
      <thead><tr><th scope="col">Address space</th><th scope="col">Address range</th><th scope="col">Address count</th></tr></thead>
      <tbody>
        {prefixes.map(p => {
          const block = azure.parseCidr(p)
          return (
            <tr key={p}>
              <td className="mono">{p}</td>
              <td className="mono">{block ? `${azure.formatIPv4(block.network)} - ${azure.formatIPv4(azure.lastAddress(block))}` : ''}</td>
              <td>{block?.size ?? ''}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export const VNET_SECTIONS: Record<string, SectionDef> = {
  addressSpace: { Body: VnetAddressSpace },
  subnets: {
    Commands: ({ target }) => <AddButton label="Subnet" guide="vnet:addSubnet" request={{ kind: 'subnet', preset: { virtualNetworkId: target.id } }} />,
    Body: VnetSubnets,
  },
  diagram: { Body: ({ target }) => <MapView scope={{ vnetId: target.id }} /> },
}

function AddButton({ label, request, guide }: { label: string; request: { kind: string; preset?: Record<string, string> }; guide: string }) {
  const startCreate = useGame(s => s.startCreate)
  return <ToolbarButton icon={<Add20Regular />} onClick={() => startCreate(request)} data-guide={guide}>{label}</ToolbarButton>
}

// ── Network security group (PORTAL-12) ─────────────────────────────────────────────────────────

function rulePreset(nsg: Resource, r: Resource): Record<string, string> {
  const rule = azure.ruleProperties(r)
  return {
    mode: 'edit', networkSecurityGroupId: nsg.id, name: r.name, priority: String(rule.priority), direction: rule.direction,
    access: rule.access, protocol: rule.protocol, sourceAddressPrefix: rule.sourceAddressPrefix, sourcePortRange: rule.sourcePortRange,
    destinationAddressPrefix: rule.destinationAddressPrefix, destinationPortRange: rule.destinationPortRange, description: rule.description ?? '',
  }
}

/** One direction's rules in processing order: custom rules by priority, then the defaults (NSG-1, NSG-3). */
function NsgRules({ target, world, direction }: SectionProps & { direction: 'Inbound' | 'Outbound' }) {
  const nsg = asResource(target)
  const startCreate = useGame(s => s.startCreate)
  const dispatch = useGame(s => s.dispatch)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const custom = childrenOf(world, nsg, azure.SECURITY_RULE_TYPE)
  const defaults = (nsg.properties.defaultSecurityRules as azure.DefaultSecurityRule[] | undefined) ?? []
  const rules = [
    ...custom.map(r => ({ resource: r as Resource | null, name: r.name, rule: azure.ruleProperties(r) })),
    ...defaults.map(d => ({ resource: null, name: d.name, rule: d as azure.SecurityRuleProperties })),
  ].filter(x => x.rule.direction === direction).sort((a, b) => a.rule.priority - b.rule.priority)

  const remove = (ruleId: ArmId) => {
    const outcome = dispatch({ type: 'arm/securityRules/delete', payload: { securityRuleId: ruleId } })
    setRefusal(outcome.status === 'refused' ? outcome.refusal : null)
  }
  return (
    <>
      {refusal && <RefusalNotice refusal={refusal} />}
      <div className="grid-scroll">
        <table className="grid rules-grid" aria-label={`${direction} security rules, in processing order`}>
          <thead>
            <tr>
              <th scope="col">Priority</th><th scope="col">Name</th><th scope="col">Port</th><th scope="col">Protocol</th>
              <th scope="col">Source</th><th scope="col">Destination</th><th scope="col">Action</th><th scope="col"><span className="visually-hidden">Delete</span></th>
            </tr>
          </thead>
          <tbody>
            {rules.map(({ resource, name, rule }) => (
              <tr key={name} className={resource ? '' : 'rule-default'}>
                <td className="mono">{rule.priority}</td>
                <td>
                  {resource
                    ? <Link as="button" onClick={() => startCreate({ kind: 'securityRule', preset: rulePreset(nsg, resource) })}>{name}</Link>
                    : name}
                  {resource && resource.provisioningState !== 'Succeeded' && <Badge appearance="tint" color="warning" size="small">{resource.provisioningState}…</Badge>}
                </td>
                <td className="mono">{rule.destinationPortRange}</td>
                <td>{PROTOCOL_LABEL[rule.protocol] ?? rule.protocol}</td>
                <td className="mono">{rule.sourceAddressPrefix}</td>
                <td className="mono">{rule.destinationAddressPrefix}</td>
                <td><span className={`access access-${rule.access.toLowerCase()}`}>{rule.access}</span></td>
                <td>
                  {resource && <Button appearance="subtle" size="small" icon={<Delete20Regular />} aria-label={`Delete ${name}`} onClick={() => remove(resource.id)} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="field-hint">Default rules can't be changed or deleted. Add a rule with a lower priority number to take precedence over them.</p>
    </>
  )
}

const nsgSubnets = (world: SectionProps['world'], nsg: Resource) => of(world, azure.SUBNET_TYPE).filter(s => azure.sameName(subnetNsg(s) ?? '', nsg.id))
const nsgNics = (world: SectionProps['world'], nsg: Resource) => of(world, azure.NIC_TYPE).filter(n => azure.sameName(azure.nicNsgId(n) ?? '', nsg.id))

export const NSG_SECTIONS: Record<string, SectionDef> = {
  inbound: {
    Commands: ({ target }) => <AddButton label="Add" guide="nsg:inbound:add" request={{ kind: 'securityRule', preset: { networkSecurityGroupId: target.id, direction: 'Inbound' } }} />,
    Body: props => <NsgRules {...props} direction="Inbound" />,
  },
  outbound: {
    Commands: ({ target }) => <AddButton label="Add" guide="nsg:outbound:add" request={{ kind: 'securityRule', preset: { networkSecurityGroupId: target.id, direction: 'Outbound' } }} />,
    Body: props => <NsgRules {...props} direction="Outbound" />,
  },
  networkInterfaces: {
    Body: ({ target, world }) => <LinkedList ids={nsgNics(world, asResource(target)).map(n => n.id)} empty="This network security group isn't associated with any network interface." />,
  },
  subnets: {
    Commands: ({ target }) => <AddButton label="Associate" guide="nsg:associate" request={{ kind: 'associateSubnet', preset: { networkSecurityGroupId: target.id } }} />,
    Body: ({ target, world }) => <LinkedList ids={nsgSubnets(world, asResource(target)).map(s => s.id)} empty="This network security group isn't associated with any subnet." />,
  },
  effectiveRules: { Body: () => <EffectiveRulesPanel /> },
}

// ── Network interface (PORTAL-13) ──────────────────────────────────────────────────────────────

function nicPreset(nic: Resource, nsgId: string): Record<string, string> {
  const parsed = azure.parseArmId(nic.id)
  const config = azure.ipConfigurationsOf(nic)[0]
  return {
    mode: 'edit', group: `${parsed?.subscriptionId ?? ''}|${parsed?.resourceGroupName ?? ''}`, name: nic.name, location: nic.location,
    subnetId: config?.properties.subnet.id ?? '', privateIPAllocationMethod: config?.properties.privateIPAllocationMethod ?? 'Dynamic',
    privateIPAddress: config?.properties.privateIPAddress ?? '', publicIPAddressId: config?.properties.publicIPAddress?.id ?? '', networkSecurityGroupId: nsgId,
  }
}

function NicIpConfigurations({ target }: SectionProps) {
  const nic = asResource(target)
  const startCreate = useGame(s => s.startCreate)
  const configs = azure.ipConfigurationsOf(nic)
  return (
    <div className="grid-scroll">
      <table className="grid">
        <thead><tr><th scope="col">Name</th><th scope="col">Private IP address</th><th scope="col">Assignment</th><th scope="col">Public IP address</th><th scope="col">Subnet</th></tr></thead>
        <tbody>
          {configs.map(c => (
            <tr key={c.name}>
              <td><Link as="button" onClick={() => startCreate({ kind: 'networkInterface', preset: nicPreset(nic, azure.nicNsgId(nic) ?? '') })}>{c.name}</Link></td>
              <td className="mono">{c.properties.privateIPAddress}</td>
              <td>{c.properties.privateIPAllocationMethod}</td>
              <td><ResourceLink id={c.properties.publicIPAddress?.id ?? null} /></td>
              <td><ResourceLink id={c.properties.subnet.id} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Network security group on a NIC: pick one (or none) and Save, as the portal's page does. */
function NicNetworkSecurityGroup({ target, world }: SectionProps) {
  const nic = asResource(target)
  const check = useGame(s => s.check)
  const dispatch = useGame(s => s.dispatch)
  const current = azure.nicNsgId(nic) ?? ''
  const [choice, setChoice] = useState(current)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const nsgs = of(world, azure.NSG_TYPE).sort((a, b) => a.name.localeCompare(b.name))
  const preset = nicPreset(nic, choice)
  const command = {
    type: 'arm/networkInterfaces/write',
    payload: {
      subscriptionId: azure.parseArmId(nic.id)?.subscriptionId ?? '', resourceGroupName: azure.parseArmId(nic.id)?.resourceGroupName ?? '',
      name: nic.name, location: nic.location, subnetId: preset.subnetId, privateIPAllocationMethod: preset.privateIPAllocationMethod,
      ...(preset.privateIPAllocationMethod === 'Static' ? { privateIPAddress: preset.privateIPAddress } : {}),
      publicIPAddressId: preset.publicIPAddressId || null, networkSecurityGroupId: choice || null,
    },
  }
  const save = () => {
    const refused = check(command)
    if (refused) return setRefusal(refused)
    const outcome = dispatch(command)
    setRefusal(outcome.status === 'refused' ? outcome.refusal : null)
  }
  return (
    <div className="section-form">
      <p>Currently: <ResourceLink id={current || null} /></p>
      <Field label="Network security group">
        <Dropdown value={nsgs.find(n => n.id === choice)?.name ?? 'None'} selectedOptions={[choice]} onOptionSelect={(_, d) => setChoice(d.optionValue ?? '')}>
          <Option value="">None</Option>
          {nsgs.map(n => <Option key={n.id} value={n.id}>{n.name}</Option>)}
        </Dropdown>
      </Field>
      {refusal && <RefusalNotice refusal={refusal} />}
      <Button appearance="primary" disabled={choice === current} onClick={save}>Save</Button>
    </div>
  )
}

export const NIC_SECTIONS: Record<string, SectionDef> = {
  ipConfigurations: { Body: NicIpConfigurations },
  networkSecurityGroup: { Body: props => <NicNetworkSecurityGroup key={props.target.id} {...props} /> },
  effectiveRules: { Body: () => <EffectiveRulesPanel /> },
}

/** Overview extras for network types: nothing beyond Essentials yet. */
export const OverviewOnly = (props: SectionProps) => <Essentials {...props} />
