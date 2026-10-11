import { useState } from 'react'
import './portal.css'
import { useMediaQuery } from '../useMediaQuery.ts'
import { Breadcrumbs } from './Breadcrumbs.tsx'
import { ContextPaneHost } from './ContextPaneHost.tsx'
import { Header } from './Header.tsx'
import { PortalMenu } from './PortalMenu.tsx'
import { TicketPane } from './TicketPane.tsx'
import { useUnreadTicketMessages } from './useUnreadTicketMessages.ts'
import { WorkingPane } from './WorkingPane.tsx'
import { useGame } from '../gameContext.ts'

/** The portal shell (spec §3): header, breadcrumb, working pane, the ticket on the right, side panes on top. */
export function Shell() {
  const narrow = useMediaQuery('(max-width: 900px)')
  const [menuOpen, setMenuOpen] = useState(false)
  const setTicketOpen = useGame(s => s.setTicketOpen)
  const unread = useUnreadTicketMessages()
  return (
    <div className={`portal ${narrow ? 'is-narrow' : ''}`}>
      <Header onMenu={() => setMenuOpen(true)} narrow={narrow} onTicket={() => setTicketOpen(true)} ticketBadge={unread} />
      <PortalMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="portal-main">
        <Breadcrumbs />
        <main className="portal-work" id="main">
          <WorkingPane />
        </main>
      </div>
      <TicketPane narrow={narrow} />
      <ContextPaneHost />
    </div>
  )
}
