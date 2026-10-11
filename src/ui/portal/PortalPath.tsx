import { Fragment, useContext, useEffect, useMemo } from 'react'
import { Link } from '@fluentui/react-components'
import { ChevronRight12Regular } from '@fluentui/react-icons'
import type { MissionDef, PathStep } from '../../missions/index.ts'
import { GameStoreContext, useGame } from '../gameContext.ts'
import { nextStepIndex, resolvePath } from './guide.ts'

/**
 * A portal path in the ticket (D-7): each step links to its page when the resource exists, and is plain text
 * when it doesn't yet. With `highlight`, the control for the next step glows on the page (Guided mode).
 */
export function PortalPath({ def, steps, highlight }: { def: MissionDef; steps: readonly PathStep[]; highlight: boolean }) {
  const tenant = useGame(s => s.world.tenant)
  const runtime = useGame(s => s.world.runtime)
  const external = useGame(s => s.world.external)
  const route = useGame(s => s.session.ui.nav.route)
  const navigate = useGame(s => s.navigate)
  const store = useContext(GameStoreContext)
  const resolved = useMemo(
    () => (store ? resolvePath(steps, def, store.getState().world) : []),
    // Roles read resources, apps and runtime state; not every tick.
    [steps, def, store, tenant, runtime, external], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const next = nextStepIndex(resolved, route)
  useGuideHighlight(highlight ? resolved[next]?.guide ?? null : null)
  return (
    <p className="portal-path">
      <span className="visually-hidden">Portal path: </span>
      {resolved.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight12Regular className="portal-path-sep" aria-hidden="true" />}
          {s.route
            ? <Link as="button" className={i === next && highlight ? 'is-next' : ''} onClick={() => navigate(s.route!)}>{s.label}</Link>
            : <span className={i === next && highlight ? 'is-next' : ''}>{s.label}</span>}
        </Fragment>
      ))}
    </p>
  )
}

/** Puts a soft ring on the controls marked `data-guide={id}`, and keeps it there as the page changes. */
function useGuideHighlight(id: string | null) {
  useEffect(() => {
    if (!id) return
    const selector = `[data-guide="${CSS.escape(id)}"]`
    const apply = () => {
      document.querySelectorAll('.guide-active').forEach(el => { if (!el.matches(selector)) el.classList.remove('guide-active') })
      document.querySelectorAll(selector).forEach(el => el.classList.add('guide-active'))
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      document.querySelectorAll('.guide-active').forEach(el => el.classList.remove('guide-active'))
    }
  }, [id])
}
