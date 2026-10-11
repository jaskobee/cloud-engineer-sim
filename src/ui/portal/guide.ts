import { azure, type World } from '../../engine/index.ts'
import type { MissionDef, PathStep } from '../../missions/index.ts'
import { routeForResource, sameRoute, type Route, type ServiceId } from './route.ts'
import { SERVICES } from './services.ts'

/**
 * Guided portal paths (D-7): a mission's path steps resolved against the current world. A step whose
 * resource doesn't exist yet has no route and is shown as text. `guide` is the `data-guide` id of the
 * control to highlight when the step is next.
 */
export interface ResolvedStep {
  label: string
  rule: string
  kind: PathStep['target']['kind']
  route: Route | null
  guide: string
  /** The page the step's control opens (Create opens the create page), so the path moves on once it's open. */
  opens?: Route
}

export function resolvePath(steps: readonly PathStep[], def: MissionDef, world: World): ResolvedStep[] {
  const out: ResolvedStep[] = []
  for (const step of steps) {
    const t = step.target
    const base = { label: step.label, rule: step.rule, kind: t.kind }
    if (t.kind === 'service') {
      const route: Route | null = t.id === 'createResource' ? { page: 'createPicker' } : SERVICES.find(s => s.id === t.id)?.route ?? null
      out.push({ ...base, route, guide: `service:${t.id}` })
    } else if (t.kind === 'resource') {
      const id = def.roles?.[t.role]?.(world) ?? null
      const resource = id ? world.tenant.resources[azure.armKey(id)] : undefined
      out.push({
        ...base, label: resource ? `${step.label}: ${resource.name}` : step.label,
        route: resource ? routeForResource(resource.id, world) : null, guide: resource ? `resource:${resource.name}` : '',
      })
    } else if (t.kind === 'section') {
      const prev = out.at(-1)?.route
      const route: Route | null = prev?.page === 'resource' ? { ...prev, section: t.section }
        : prev?.page === 'service' ? { ...prev, section: t.section }
        : null
      out.push({ ...base, route, guide: `menu:${t.section}` })
    } else {
      const kind = t.id.startsWith('create:') ? t.id.slice('create:'.length) : null
      out.push({ ...base, route: null, guide: t.id, ...(kind ? { opens: { page: 'create', kind, tab: 'basics' } as Route } : {}) })
    }
  }
  return out
}

/** The step to do next: after the furthest step whose page is open now; the first step otherwise. */
export function nextStepIndex(steps: readonly ResolvedStep[], current: Route): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    const r = steps[i]?.route
    const opens = steps[i]?.opens
    const opened = opens?.page === 'create' && current.page === 'create' && opens.kind === current.kind
    if ((r && sameRoute(r, current)) || opened) return Math.min(i + 1, steps.length - 1)
  }
  return 0
}

export const serviceRoute = (service: ServiceId, section: string): Route => ({ page: 'service', service, section })
