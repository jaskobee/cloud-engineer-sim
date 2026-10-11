import { Button, DrawerBody, DrawerHeader, DrawerHeaderTitle, OverlayDrawer } from '@fluentui/react-components'
import { Add20Regular, Apps20Regular, Dismiss20Regular, Home20Regular } from '@fluentui/react-icons'
import { useGame } from '../gameContext.ts'
import type { Route } from './route.ts'
import { ServiceIcon } from './ServiceIcon.tsx'
import { SERVICES } from './services.ts'

/** The portal menu in flyout mode (PORTAL-2, PORTAL-2s): Create a resource, Home, All services, favourites. */
export function PortalMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useGame(s => s.navigate)
  const go = (route: Route) => {
    navigate(route)
    onClose()
  }
  return (
    <OverlayDrawer open={open} onOpenChange={(_, d) => { if (!d.open) onClose() }} position="start" size="small" className="portal-menu">
      <DrawerHeader>
        <DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Close menu" icon={<Dismiss20Regular />} onClick={onClose} />}>
          Portal menu
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <nav aria-label="Portal menu">
          <ul className="portal-menu-list">
            <li><Button appearance="subtle" icon={<Add20Regular />} onClick={() => go({ page: 'createPicker' })}>Create a resource</Button></li>
            <li><Button appearance="subtle" icon={<Home20Regular />} onClick={() => go({ page: 'home' })}>Home</Button></li>
            <li><Button appearance="subtle" icon={<Apps20Regular />} onClick={() => go({ page: 'allServices' })}>All services</Button></li>
          </ul>
          <p className="portal-menu-heading">Favorites</p>
          <ul className="portal-menu-list">
            {SERVICES.map(s => (
              <li key={s.id}><Button appearance="subtle" icon={<ServiceIcon name={s.icon} />} onClick={() => go(s.route)}>{s.label}</Button></li>
            ))}
          </ul>
        </nav>
      </DrawerBody>
    </OverlayDrawer>
  )
}
