import { useGame } from '../gameContext.ts'
import { ActivityLogPanel } from '../ActivityLogPanel.tsx'
import { AlertsPanel } from '../AlertsPanel.tsx'
import { EffectiveRulesPanel, IpFlowVerifyPanel } from '../NetworkWatcher.tsx'
import { useMediaQuery } from '../useMediaQuery.ts'
import { MapView } from './MapView.tsx'
import { sectionLabel, serviceMenuForService } from './menus.ts'
import { PageFrame } from './PageFrame.tsx'
import { serviceLabel, type ServiceId } from './route.ts'
import { ServiceIcon } from './ServiceIcon.tsx'
import { ServiceMenu, ServiceMenuSelect } from './ServiceMenu.tsx'

const SECTIONS: Record<ServiceId, Record<string, () => React.JSX.Element>> = {
  monitor: {
    activityLog: () => <ActivityLogPanel />,
    alerts: () => <AlertsPanel />,
  },
  networkWatcher: {
    topology: () => <MapView />,
    ipFlowVerify: () => <IpFlowVerifyPanel />,
    effectiveRules: () => <EffectiveRulesPanel />,
  },
}

/** Monitor and Network Watcher (PORTAL-10, PORTAL-15, PORTAL-16): service menu and the section. */
export function ServicePage({ service, section }: { service: ServiceId; section: string }) {
  const navigate = useGame(s => s.navigate)
  const narrow = useMediaQuery('(max-width: 900px)')
  const groups = serviceMenuForService(service)
  const label = serviceLabel(service)
  const select = (id: string) => navigate({ page: 'service', service, section: id })
  const Body = SECTIONS[service][section]
  return (
    <div className="resource-layout">
      {!narrow && <ServiceMenu groups={groups} current={section} onSelect={select} label={label} />}
      <PageFrame title={label} section={sectionLabel(groups, section)} icon={<ServiceIcon name={service} />} className={section === 'topology' ? 'page-fill' : ''}>
        {narrow && <ServiceMenuSelect groups={groups} current={section} onSelect={select} label={label} />}
        {Body ? <Body /> : <p className="empty">This section isn't available.</p>}
      </PageFrame>
    </div>
  )
}
