import { useGame } from '../gameContext.ts'
import { PageFrame } from './PageFrame.tsx'
import { ServiceIcon } from './ServiceIcon.tsx'
import { SERVICES } from './services.ts'

/** All services (PORTAL-2s): the services the simulator has. */
export function AllServicesPage() {
  const navigate = useGame(s => s.navigate)
  return (
    <PageFrame title="All services" subtitle="The services this simulator models">
      <ul className="all-services">
        {SERVICES.map(s => (
          <li key={s.id}>
            <button type="button" className="all-services-item" onClick={() => navigate(s.route)}>
              <ServiceIcon name={s.icon} className="all-services-icon" />
              <span className="all-services-name">{s.label}</span>
              <span className="all-services-blurb">{s.blurb}</span>
            </button>
          </li>
        ))}
      </ul>
    </PageFrame>
  )
}
