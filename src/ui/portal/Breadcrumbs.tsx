import { Fragment } from 'react'
import { Breadcrumb, BreadcrumbButton, BreadcrumbDivider, BreadcrumbItem } from '@fluentui/react-components'
import { useGame } from '../gameContext.ts'
import { breadcrumbFor } from './route.ts'

/** Breadcrumb links "move back a level in your workflow" (PORTAL-3); derived from the route. */
export function Breadcrumbs() {
  const route = useGame(s => s.session.ui.nav.route)
  const map = useGame(s => s.session.ui.nav.map)
  const deployments = useGame(s => s.world.deployments)
  const navigate = useGame(s => s.navigate)
  const toggleMap = useGame(s => s.toggleMap)
  const crumbs = breadcrumbFor(route, { deployments })
  const all = map ? [...crumbs.map(c => (c.route ? c : { ...c, route })), { label: 'Map', route: null }] : crumbs
  return (
    <Breadcrumb aria-label="Breadcrumb" size="small" className="portal-breadcrumb">
      {all.map((c, i) => (
        <Fragment key={`${i}:${c.label}`}>
          {i > 0 && <BreadcrumbDivider />}
          <BreadcrumbItem>
            <BreadcrumbButton current={c.route === null} onClick={() => {
              if (!c.route) return
              if (map && i === all.length - 2) toggleMap(false)
              else navigate(c.route)
            }}>{c.label}</BreadcrumbButton>
          </BreadcrumbItem>
        </Fragment>
      ))}
    </Breadcrumb>
  )
}
