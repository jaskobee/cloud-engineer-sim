import { useGame } from '../gameContext.ts'
import { AllServicesPage } from './AllServicesPage.tsx'
import { BrowsePage } from './BrowsePage.tsx'
import { HomePage } from './HomePage.tsx'
import { MapView } from './MapView.tsx'
import { PageFrame } from './PageFrame.tsx'
import { createTitle } from './route.ts'
import { CreatePicker } from './create/CreatePicker.tsx'
import { Wizard } from './create/Wizard.tsx'
import { DeploymentPage } from './DeploymentPage.tsx'
import { ResourcePage } from './ResourcePage.tsx'
import { ServicePage } from './ServicePage.tsx'

/** The working pane (PORTAL-3): the page for the current route, or the map when the Map toggle is on. */
export function WorkingPane() {
  const route = useGame(s => s.session.ui.nav.route)
  const map = useGame(s => s.session.ui.nav.map)
  if (map) return <PageFrame title="Map" subtitle="Your client's infrastructure as the simulator sees it" className="page-fill"><MapView /></PageFrame>
  switch (route.page) {
    case 'home': return <HomePage />
    case 'allServices': return <AllServicesPage />
    case 'browse': return <BrowsePage key={route.type} type={route.type} />
    case 'service': return <ServicePage service={route.service} section={route.section} />
    case 'createPicker': return <PageFrame title="Create a resource"><CreatePicker /></PageFrame>
    case 'create':
      return (
        <PageFrame title={createTitle(route.kind)} className="page-wizard">
          <Wizard key={JSON.stringify(route)} kind={route.kind} preset={route.preset ?? {}} />
        </PageFrame>
      )
    case 'deployment':
      return <DeploymentPage key={route.id} id={route.id} />
    case 'resource':
      return <ResourcePage key={route.id} id={route.id} section={route.section} />
  }
}
