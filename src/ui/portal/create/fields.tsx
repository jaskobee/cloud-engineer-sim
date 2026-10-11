import { useState, type ReactNode } from 'react'
import { Dropdown, Field, Input, Link, Option } from '@fluentui/react-components'
import { azure, type World } from '../../../engine/index.ts'
import type { Values } from './commands.ts'

/** Form parts for the create wizards and side panes: Fluent fields with the portal's labels. */

export function TextField({ label, value, onChange, hint, placeholder, readOnly, required }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; placeholder?: string; readOnly?: boolean; required?: boolean
}) {
  return (
    <Field label={label} hint={hint ?? null} required={required ?? false} className="form-field">
      <Input value={value} onChange={(_, d) => onChange(d.value)} placeholder={placeholder ?? ""} readOnly={readOnly ?? false} />
    </Field>
  )
}

export function SelectField({ label, value, onChange, options, hint, disabled, required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]; hint?: string; disabled?: boolean; required?: boolean; placeholder?: string
}) {
  const shown = options.find(o => o[0] === value)?.[1] ?? ''
  return (
    <Field label={label} hint={hint ?? null} required={required ?? false} className="form-field">
      <Dropdown value={shown} selectedOptions={[value]} onOptionSelect={(_, d) => onChange(d.optionValue ?? '')} disabled={disabled ?? false} placeholder={placeholder ?? ''}>
        {options.map(([v, l]) => <Option key={v} value={v} text={l}>{l}</Option>)}
      </Dropdown>
    </Field>
  )
}

/** A fixed value the simulator doesn't let you change (one image, one SKU…), shown like a read-only field. */
export function FixedField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Field label={label} hint={hint ?? null} className="form-field">
      <Input value={value} readOnly appearance="filled-lighter" />
    </Field>
  )
}

export function FormSection({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  return (
    <section className="form-section">
      {title && <h2 className="form-section-title">{title}</h2>}
      {hint && <p className="form-section-hint">{hint}</p>}
      {children}
    </section>
  )
}

/** A labelled simplification: what the portal does here that the simulator doesn't. */
export function SimNote({ children }: { children: ReactNode }) {
  return <p className="sim-note"><span className="sim-label">Simulator</span> {children}</p>
}

export const REGION_OPTIONS: [string, string][] = azure.REGIONS.map(r => [r.name, r.displayName])

export type Set = (key: string, value: string) => void

/**
 * Project details (PORTAL-6): Subscription, then Resource group with "Create new". A new group is created
 * in the resource's region before the resource (as one deployment would in the portal).
 */
export function ProjectDetails({ values, set, world, heading = true }: { values: Values; set: Set; world: World; heading?: boolean }) {
  const [creatingNew, setCreatingNew] = useState(values.newResourceGroup === 'true')
  const subscriptions = Object.values(world.tenant.subscriptions)
  const groups = Object.values(world.tenant.resourceGroups)
    .filter(g => azure.parseArmId(g.id)?.subscriptionId === values.subscriptionId)
    .sort((a, b) => a.name.localeCompare(b.name))
  const toggle = (on: boolean) => {
    setCreatingNew(on)
    set('newResourceGroup', on ? 'true' : '')
    set('resourceGroupName', '')
  }
  return (
    <FormSection {...(heading ? { title: 'Project details' } : {})}>
      <SelectField label="Subscription" required value={values.subscriptionId ?? ''} onChange={x => set('subscriptionId', x)}
        options={subscriptions.map(s => [s.subscriptionId, s.displayName])} />
      {creatingNew ? (
        <TextField label="Resource group (new)" required value={values.resourceGroupName ?? ''} onChange={x => set('resourceGroupName', x)} placeholder="rg-pixelforge-prod" />
      ) : (
        <SelectField label="Resource group" required value={values.resourceGroupName ?? ''} onChange={x => set('resourceGroupName', x)} placeholder="Select a resource group"
          options={groups.map(g => [g.name, g.name])} {...(groups.length === 0 ? { hint: 'No resource group in this subscription yet. Create new.' } : {})} />
      )}
      <Link as="button" className="create-new-link" onClick={() => toggle(!creatingNew)}>{creatingNew ? 'Use existing' : 'Create new'}</Link>
    </FormSection>
  )
}

/**
 * Defaults for Project details: the first subscription, and no resource group picked yet (the player chooses, so
 * nothing lands in a client's existing group by accident); Create new when the subscription has none.
 */
export function initialProject(world: World): Values {
  const sub = Object.values(world.tenant.subscriptions)[0]?.subscriptionId ?? ''
  const group = Object.values(world.tenant.resourceGroups)
    .filter(g => azure.parseArmId(g.id)?.subscriptionId === sub)
    .sort((a, b) => a.name.localeCompare(b.name))[0]
  return { subscriptionId: sub, resourceGroupName: '', newResourceGroup: group ? '' : 'true', location: 'westeurope', name: '' }
}
