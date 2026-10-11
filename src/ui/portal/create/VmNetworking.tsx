import { useState } from 'react'
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, Link } from '@fluentui/react-components'
import { azure, type Resource, type World } from '../../../engine/index.ts'
import { defaultPublicIpName, nicNameFor } from './commands.ts'
import { FixedField, FormSection, SelectField, SimNote } from './fields.tsx'
import type { TabProps } from './wizards.tsx'

/**
 * Create a virtual machine › Networking (PORTAL-20, PORTAL-20s): the portal creates the VM's network interface here,
 * from Virtual network, Subnet, Public IP and NIC network security group. A new public IP is the default; Create new
 * opens Create public IP address (Name, SKU Standard, Assignment Static, OK).
 */

const byName = (a: Resource, b: Resource) => a.name.localeCompare(b.name)

/** Virtual networks a VM in this region can use: a NIC must be in the VM's region and its VNet's (NIC-1). */
export const vnetsIn = (world: World, location: string): Resource[] =>
  Object.values(world.tenant.resources).filter(r => r.type.toLowerCase() === azure.VNET_TYPE.toLowerCase() && r.location === location).sort(byName)

export const subnetsOf = (world: World, vnetId: string): Resource[] =>
  Object.values(world.tenant.resources)
    .filter(r => r.type.toLowerCase() === azure.SUBNET_TYPE.toLowerCase() && azure.sameName(azure.parentResourceId(r.id) ?? '', vnetId))
    .sort(byName)

export function VmNetworking({ values, set, world }: TabProps) {
  const [dialog, setDialog] = useState(false)
  const vnets = vnetsIn(world, values.location ?? 'westeurope')
  const vnetId = vnets.some(n => n.id === values.vnetId) ? values.vnetId ?? '' : ''
  const subnets = subnetsOf(world, vnetId)
  const pipName = defaultPublicIpName(values)
  const pickVnet = (id: string) => {
    set('vnetId', id)
    set('subnetId', subnetsOf(world, id)[0]?.id ?? '')
  }
  return (
    <FormSection title="Network interface" hint="When you create a VM in the portal, a network interface is created for it here.">
      <SelectField label="Virtual network" required value={vnetId} onChange={pickVnet}
        options={vnets.map(n => [n.id, `${n.name} (${azure.parseArmId(n.id)?.resourceGroupName ?? ''})`])}
        {...(vnets.length === 0 ? { hint: `No virtual network in ${azure.regionDisplayName(values.location ?? 'westeurope')} yet. Create one first.` } : {})} />
      <SelectField label="Subnet" required value={values.subnetId ?? ''} onChange={x => set('subnetId', x)}
        options={subnets.map(s => [s.id, `${s.name} (${String(s.properties.addressPrefix)})`])}
        {...(vnetId && subnets.length === 0 ? { hint: 'This virtual network has no subnet yet. Add one under Subnets.' } : {})} />
      <SelectField label="Public IP" value={values.publicIp === 'none' ? 'none' : 'new'} onChange={x => set('publicIp', x)}
        options={[['new', `(new) ${pipName}`], ['none', 'None']]}
        hint="Internet clients reach the VM only through a public IP. Leave it out for VMs nobody outside should reach." />
      <Link as="button" className="create-new-link" onClick={() => setDialog(true)} data-guide="vm:createPublicIp">Create new</Link>
      <FixedField label="NIC network security group" value="None" />
      <SimNote>The portal also offers Advanced, to create or pick a network security group for this network interface. The simulator doesn't model it here: associate an NSG with the subnet or the network interface afterwards.</SimNote>
      <FixedField label="Network interface name" value={values.name ? nicNameFor(values.name) : ''} hint="Simulator default name: the portal picks its own." />
      {dialog && <PublicIpDialog initial={pipName} onCancel={() => setDialog(false)} onOk={name => { set('publicIp', 'new'); set('publicIpName', name); setDialog(false) }} />}
    </FormSection>
  )
}

function PublicIpDialog({ initial, onOk, onCancel }: { initial: string; onOk: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial)
  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => { if (!d.open) onCancel() }}>
      <DialogSurface aria-label="Create public IP address">
        <DialogBody>
          <DialogTitle>Create public IP address</DialogTitle>
          <DialogContent className="dialog-form">
            <Field label="Name" required className="form-field"><Input value={name} onChange={(_, d) => setName(d.value)} /></Field>
            <FixedField label="SKU" value="Standard" />
            <FixedField label="Assignment" value="Static" hint="Static is the only option for a Standard public IP." />
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" disabled={name.trim() === ''} onClick={() => onOk(name.trim())}>OK</Button>
            <Button onClick={onCancel}>Cancel</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
