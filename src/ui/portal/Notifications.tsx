import { useContext, useMemo, useState } from 'react'
import { Button, CounterBadge, DrawerBody, DrawerHeader, DrawerHeaderTitle, Link, OverlayDrawer, Tooltip } from '@fluentui/react-components'
import { Alert20Regular, CheckmarkCircle20Filled, Dismiss20Regular, ErrorCircle20Filled, Info20Regular, Mail20Regular } from '@fluentui/react-icons'
import { formatSimTime } from '../format.ts'
import { GameStoreContext, useGame } from '../gameContext.ts'
import { notificationsOf, type Notification } from './notifications.ts'

/** Notifications (PORTAL-1, PORTAL-8): the bell, its unread count and the panel. */
export function NotificationsButton() {
  const deployments = useGame(s => s.world.deployments)
  const activityLog = useGame(s => s.world.activityLog)
  const alerts = useGame(s => s.world.alerts)
  const mission = useGame(s => s.world.mission)
  const store = useContext(GameStoreContext)
  const seenAt = useGame(s => s.session.ui.nav.notificationsSeenAt)
  const markSeen = useGame(s => s.markNotificationsSeen)
  const [open, setOpen] = useState(false)
  // Recomputed when what they're derived from changes, not on every tick.
  const all = useMemo(() => (store ? notificationsOf(store.getState().world) : []), [store, deployments, activityLog, alerts, mission]) // eslint-disable-line react-hooks/exhaustive-deps
  const unread = all.filter(n => n.at > seenAt).length

  const show = (value: boolean) => {
    setOpen(value)
    if (value && store) markSeen(store.getState().world.clock.now)
  }

  return (
    <>
      <span className="portal-bell">
        <Tooltip content="Notifications" relationship="label">
          <Button appearance="transparent" className="portal-header-button" icon={<Alert20Regular />} onClick={() => show(true)} />
        </Tooltip>
        {unread > 0 && <CounterBadge count={unread} size="small" color="danger" className="portal-header-count" aria-label={`${unread} unread`} />}
      </span>
      <OverlayDrawer open={open} onOpenChange={(_, d) => show(d.open)} position="end" size="small">
        <DrawerHeader>
          <DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Close" icon={<Dismiss20Regular />} onClick={() => show(false)} />}>
            Notifications
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          {all.length === 0 ? <p className="empty">No notifications yet.</p> : (
            <ul className="notification-list">
              {all.map(n => <NotificationRow key={n.id} n={n} onDone={() => show(false)} />)}
            </ul>
          )}
        </DrawerBody>
      </OverlayDrawer>
    </>
  )
}

function NotificationRow({ n, onDone }: { n: Notification; onDone: () => void }) {
  const epochMs = useGame(s => s.world.clock.epochMs)
  const navigate = useGame(s => s.navigate)
  const setTicketOpen = useGame(s => s.setTicketOpen)
  const { day, time } = formatSimTime(epochMs, n.at)
  const Icon = n.kind === 'message' ? Mail20Regular : n.status === 'success' ? CheckmarkCircle20Filled : n.status === 'error' ? ErrorCircle20Filled : Info20Regular
  return (
    <li className={`notification is-${n.status}`}>
      <Icon className="notification-icon" aria-hidden="true" />
      <div>
        <p className="notification-title">{n.title}</p>
        <p className="notification-detail">{n.detail}</p>
        <p className="notification-time">{day} {time}</p>
        {n.route && n.action && <Link as="button" onClick={() => { navigate(n.route!); onDone() }}>{n.action}</Link>}
        {n.route && !n.action && <Link as="button" onClick={() => { navigate(n.route!); onDone() }}>Details</Link>}
        {n.kind === 'message' && <Link as="button" onClick={() => { setTicketOpen(true); onDone() }}>Open the ticket</Link>}
      </div>
    </li>
  )
}
