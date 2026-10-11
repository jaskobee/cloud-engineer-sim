import { azure, type ArmId, type Resource } from '../../engine/index.ts'
import { infoTopicForType } from '../../missions/index.ts'
import { useGame } from '../gameContext.ts'
import { useStableWorld } from './useStableWorld.ts'
import { InfoButton } from '../Info.tsx'
import { typeLabel } from '../resourceKinds.ts'
import { useMediaQuery } from '../useMediaQuery.ts'
import { resolveSection, sectionLabel, serviceMenuFor } from './menus.ts'
import { PageFrame } from './PageFrame.tsx'
import { breadcrumbFor } from './route.ts'
import { sectionsFor } from './sections/index.ts'
import { TypeIcon } from './ServiceIcon.tsx'
import { ServiceMenu, ServiceMenuSelect } from './ServiceMenu.tsx'

/**
 * A resource group's or resource's page (PORTAL-3, PORTAL-4): service menu, title `name | Section`, the
 * section's command bar and content. A resource that no longer exists says so instead of crashing.
 */
export function ResourcePage({ id, section }: { id: ArmId; section: string }) {
  const world = useStableWorld()
  const navigate = useGame(s => s.navigate)
  const narrow = useMediaQuery('(max-width: 900px)')
  const target = world.tenant.resources[azure.armKey(id)] ?? world.tenant.resourceGroups[azure.armKey(id)]
  const name = breadcrumbFor({ page: 'resource', id, section }, world).at(-1)?.label ?? id

  if (!target) {
    return (
      <PageFrame title={name}>
        <p className="empty">This resource no longer exists. It may have been deleted, or it was never created in this subscription.</p>
      </PageFrame>
    )
  }

  const type = 'type' in target && typeof target.type === 'string' ? target.type : 'resourcegroup'
  const groups = serviceMenuFor(type)
  const sections = sectionsFor(type)
  const resolved = resolveSection(type, section)
  const current = sections[resolved] ? resolved : 'overview'
  const def = sections[current] ?? sections.overview
  const label = type === 'resourcegroup' ? 'Resource group' : typeLabel(type)
  const topic = type === 'resourcegroup' ? 'resource-group' : infoTopicForType(type)
  const select = (next: string) => navigate({ page: 'resource', id, section: next })
  const state = (target as Partial<Resource>).provisioningState
  const creating = state && state !== 'Succeeded' ? state : null
  if (!def) return null

  return (
    <div className="resource-layout">
      {!narrow && <ServiceMenu groups={groups} current={current} onSelect={select} label={target.name} />}
      <PageFrame
        title={target.name}
        section={sectionLabel(groups, current)}
        subtitle={<>{label}{topic && <InfoButton topic={topic} />}{creating && <span className="page-state"> · {creating}…</span>}</>}
        icon={<TypeIcon type={type} />}
        {...(def.Commands ? { commands: <def.Commands target={target} world={world} /> } : {})}
        className={current === 'diagram' ? 'page-fill' : ''}
      >
        {narrow && <ServiceMenuSelect groups={groups} current={current} onSelect={select} label={target.name} />}
        <def.Body target={target} world={world} />
      </PageFrame>
    </div>
  )
}
