import { Button } from '@fluentui/react-components'
import { Add24Regular } from '@fluentui/react-icons'
import { azure, type ArmId } from '../../engine/index.ts'
import { useGame } from '../gameContext.ts'
import { typeLabel } from '../resourceKinds.ts'
import { PageFrame } from './PageFrame.tsx'
import { ServiceIcon, TypeIcon } from './ServiceIcon.tsx'
import { SERVICES } from './services.ts'

/** Home (PORTAL-2): Create a resource, the services, and recently visited resources. */
export function HomePage() {
  const navigate = useGame(s => s.navigate)
  return (
    <PageFrame title="Home" className="home">
      <section aria-labelledby="home-services">
        <h2 id="home-services" className="section-title">Azure services</h2>
        <ul className="service-tiles">
          <li>
            <button type="button" className="service-tile" onClick={() => navigate({ page: 'createPicker' })}>
              <span className="service-tile-icon is-create"><Add24Regular aria-hidden="true" /></span>
              <span>Create a resource</span>
            </button>
          </li>
          {SERVICES.map(s => (
            <li key={s.id}>
              <button type="button" className="service-tile" onClick={() => navigate(s.route)}>
                <span className="service-tile-icon"><ServiceIcon name={s.icon} /></span>
                <span>{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <RecentResources />
    </PageFrame>
  )
}

function RecentResources() {
  const nav = useGame(s => s.session.ui.nav)
  const tenant = useGame(s => s.world.tenant)
  const navigate = useGame(s => s.navigate)
  const seen = new Set<string>()
  const recent: ArmId[] = []
  for (const r of [nav.route, ...[...nav.back].reverse()]) {
    if (r.page !== 'resource' || seen.has(r.id.toLowerCase())) continue
    seen.add(r.id.toLowerCase())
    if (tenant.resources[azure.armKey(r.id)] || tenant.resourceGroups[azure.armKey(r.id)]) recent.push(r.id)
  }
  return (
    <section aria-labelledby="home-recent">
      <h2 id="home-recent" className="section-title">Recent resources</h2>
      {recent.length === 0 ? <p className="empty">Resources you open appear here.</p> : (
        <table className="grid">
          <thead><tr><th scope="col">Name</th><th scope="col">Type</th></tr></thead>
          <tbody>
            {recent.slice(0, 8).map(id => {
              const parsed = azure.parseArmId(id)
              const type = parsed?.type ?? 'resourcegroup'
              return (
                <tr key={id}>
                  <td>
                    <Button appearance="transparent" className="grid-link" icon={<TypeIcon type={type} />} onClick={() => navigate({ page: 'resource', id, section: 'overview' })}>
                      {parsed?.names.at(-1) ?? parsed?.resourceGroupName}
                    </Button>
                  </td>
                  <td>{parsed?.type ? typeLabel(parsed.type) : 'Resource group'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
