import { azure, type ArmId, type Resource, type Tenant } from '../engine/index.ts'
import { useGame } from './gameContext.ts'
import { typeLabel } from './resourceKinds.ts'

/**
 * Everything in the subscription, grouped the way Azure groups it: resource group → virtual network →
 * subnets, and the other resources beside them. A plain list for now; the architecture canvas
 * (step 7) replaces it with the visual model.
 */
export function ResourceList() {
  const tenant = useGame(s => s.world.tenant)
  const selectedId = useGame(s => s.session.ui.selectedId)
  const select = useGame(s => s.select)
  const groups = Object.values(tenant.resourceGroups)

  return (
    <div className="resources">
      {groups.map(group => {
        const inGroup = topLevel(tenant).filter(r => azure.sameName(azure.parseArmId(r.id)?.resourceGroupName ?? '', group.name)
          && azure.parseArmId(r.id)?.subscriptionId === azure.parseArmId(group.id)?.subscriptionId)
        return (
          <section key={group.id} className="rg" aria-label={`Resource group ${group.name}`}>
            <Row resource={null} label="Resource group" name={group.name} detail={azure.regionDisplayName(group.location)}
              id={group.id} selected={selectedId === group.id} onSelect={select} />
            {inGroup.length === 0 && <p className="empty rg-empty">Empty. Create a virtual network or another resource in it.</p>}
            <ul className="rg-items">
              {inGroup.map(r => (
                <li key={r.id}>
                  <Row resource={r} id={r.id} selected={selectedId === r.id} onSelect={select} />
                  <Children tenant={tenant} parent={r} selectedId={selectedId} onSelect={select} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

const CHILD_TYPE: Record<string, string> = {
  [azure.VNET_TYPE.toLowerCase()]: azure.SUBNET_TYPE,
  [azure.NSG_TYPE.toLowerCase()]: azure.SECURITY_RULE_TYPE,
}

/** Top-level resources (not subnets or security rules), sorted by type then name. */
function topLevel(tenant: Tenant): Resource[] {
  return Object.values(tenant.resources)
    .filter(r => (azure.parseArmId(r.id)?.names.length ?? 0) === 1)
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
}

function Children({ tenant, parent, selectedId, onSelect }: { tenant: Tenant; parent: Resource; selectedId: ArmId | null; onSelect: (id: ArmId) => void }) {
  const childType = CHILD_TYPE[parent.type.toLowerCase()]
  if (!childType) return null
  const prefix = `${parent.id.toLowerCase()}/`
  const children = Object.values(tenant.resources)
    .filter(r => r.type.toLowerCase() === childType.toLowerCase() && r.id.toLowerCase().startsWith(prefix))
    .sort((a, b) => sortKey(a) - sortKey(b) || a.name.localeCompare(b.name))
  if (children.length === 0) return null
  return (
    <ul className="children">
      {children.map(c => (
        <li key={c.id}><Row resource={c} id={c.id} selected={selectedId === c.id} onSelect={onSelect} /></li>
      ))}
    </ul>
  )
}

const sortKey = (r: Resource) => (typeof r.properties.priority === 'number' ? r.properties.priority : 0)

/** The short fact shown next to a resource's name. */
function detailOf(r: Resource): string {
  const p = r.properties
  switch (r.type.toLowerCase()) {
    case azure.VNET_TYPE.toLowerCase(): return azure.addressPrefixesOf(r).join(', ')
    case azure.SUBNET_TYPE.toLowerCase(): return String(p.addressPrefix)
    case azure.SECURITY_RULE_TYPE.toLowerCase(): {
      const rule = azure.ruleProperties(r)
      return `${rule.priority} · ${rule.access} ${rule.direction.toLowerCase()} ${rule.destinationPortRange}`
    }
    case azure.PUBLIC_IP_TYPE.toLowerCase(): return String(p.ipAddress)
    case azure.NIC_TYPE.toLowerCase(): return azure.ipConfigurationsOf(r)[0]?.properties.privateIPAddress ?? ''
    case azure.VM_TYPE.toLowerCase(): return String((p.hardwareProfile as { vmSize?: string } | undefined)?.vmSize ?? '')
    case azure.DISK_TYPE.toLowerCase(): return r.sku?.name ?? ''
    default: return azure.regionDisplayName(r.location)
  }
}

function Row(props: { resource: Resource | null; id: ArmId; selected: boolean; onSelect: (id: ArmId) => void; label?: string; name?: string; detail?: string }) {
  const { resource } = props
  return (
    <button type="button" className="res" aria-pressed={props.selected} onClick={() => props.onSelect(props.id)}>
      <span className="res-type">{props.label ?? (resource ? typeLabel(resource.type) : '')}</span>
      <span className="res-name">
        {props.name ?? resource?.name}
        {resource && resource.provisioningState !== 'Succeeded' && (
          <span className={`res-state res-state-${resource.provisioningState.toLowerCase()}`}>{resource.provisioningState}…</span>
        )}
      </span>
      <span className="res-detail mono">{props.detail ?? (resource ? detailOf(resource) : '')}</span>
    </button>
  )
}
