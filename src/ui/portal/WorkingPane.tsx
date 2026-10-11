import { CreatePanel } from '../CreatePanel.tsx'
import { DeploymentsPanel } from '../DeploymentsPanel.tsx'
import { useGame } from '../gameContext.ts'
import { Inspector } from '../Inspector.tsx'
import { AllServicesPage } from './AllServicesPage.tsx'
import { BrowsePage } from './BrowsePage.tsx'
import { HomePage } from './HomePage.tsx'
import { MapView } from './MapView.tsx'
import { PageFrame } from './PageFrame.tsx'
import { breadcrumbFor, createTitle } from './route.ts'
import { ServicePage } from './ServicePage.tsx'

/** The working pane (PORTAL-3): the page for the current route, or the map when the Map toggle is on. */
export function WorkingPane() {
  const route = useGame(s => s.session.ui.nav.route)
  const map = useGame(s => s.session.ui.nav.map)
  const deployments = useGame(s => s.world.deployments)
  if (map) return <PageFrame title="Map" subtitle="Your client's infrastructure as the simulator sees it" className="page-fill"><MapView /></PageFrame>
  switch (route.page) {
    case 'home': return <HomePage />
    case 'allServices': return <AllServicesPage />
    case 'browse': return <BrowsePage key={route.type} type={route.type} />
    case 'service': return <ServicePage service={route.service} section={route.section} />
    case 'createPicker': return <PageFrame title="Create a resource"><CreatePanel request={{ kind: null }} /></PageFrame>
    case 'create':
      return (
        <PageFrame title={createTitle(route.kind)}>
          <CreatePanel key={JSON.stringify(route)} request={{ kind: route.kind, ...(route.preset ? { preset: route.preset } : {}) }} />
        </PageFrame>
      )
    case 'deployment':
      return <PageFrame title={breadcrumbFor(route, { deployments }).at(-1)?.label ?? 'Deployment'} subtitle="Deployment"><DeploymentsPanel /></PageFrame>
    case 'resource':
      return <PageFrame title={breadcrumbFor(route, { deployments }).at(-1)?.label ?? ''}><Inspector key={route.id} id={route.id} /></PageFrame>
  }
}
