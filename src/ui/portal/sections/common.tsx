import type { ReactNode } from 'react'
import type { SectionProps } from './types.ts'
import { Link } from '@fluentui/react-components'
import { azure, type ArmId } from '../../../engine/index.ts'
import { useGame } from '../../gameContext.ts'
import { useStableWorld } from '../useStableWorld.ts'
import { essentialsRows } from '../resourceFacts.ts'
import { routeForResource } from '../route.ts'
import { createdByLabel } from '../callers.ts'

/** Essentials (PORTAL-4, PORTAL-4s): two columns of label/value pairs, like the portal's Overview. */
export function Essentials({ target, world }: SectionProps) {
  const rows = essentialsRows(target, world)
  const navigate = useGame(s => s.navigate)
  const parsed = azure.parseArmId(target.id)
  const groupId = parsed && parsed.type ? azure.resourceGroupId(parsed.subscriptionId, parsed.resourceGroupName) : null
  return (
    <section className="essentials" aria-labelledby="essentials-title">
      <h2 id="essentials-title" className="essentials-title">Essentials</h2>
      <dl className="essentials-grid">
        {rows.map(([label, value]) => (
          <div key={label} className="essentials-row">
            <dt>{label}</dt>
            <dd>
              {label === 'Resource group' && groupId
                ? <Link as="button" onClick={() => navigate({ page: 'resource', id: groupId, section: 'overview' })}>{value}</Link>
                : value}
            </dd>
          </div>
        ))}
        <div className="essentials-row">
          <dt>Created by <span className="sim-label" title="A simulator field. In the portal, look in the resource's Activity log.">Simulator</span></dt>
          <dd>{createdByLabel(target.id, world)}</dd>
        </div>
      </dl>
      <p className="resource-id"><span>Resource ID</span><code>{target.id}</code></p>
    </section>
  )
}

/** A link to another resource's page, or plain text when it doesn't exist (any more). */
export function ResourceLink({ id, children }: { id: ArmId | null | undefined; children?: ReactNode }) {
  const world = useStableWorld()
  const navigate = useGame(s => s.navigate)
  if (!id) return <>None</>
  const r = world.tenant.resources[azure.armKey(id)] ?? world.tenant.resourceGroups[azure.armKey(id)]
  if (!r) return <>{children ?? id.split('/').at(-1)}</>
  return <Link as="button" onClick={() => navigate(routeForResource(id, world))}>{children ?? r.name}</Link>
}

/** A simple list of linked resources, or a sentence when there are none. */
export function LinkedList({ ids, empty }: { ids: ArmId[]; empty: string }) {
  if (ids.length === 0) return <p className="empty">{empty}</p>
  return (
    <ul className="linked-list">
      {ids.map(id => <li key={id}><ResourceLink id={id} /></li>)}
    </ul>
  )
}
