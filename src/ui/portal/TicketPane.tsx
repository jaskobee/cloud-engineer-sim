import { Button, CounterBadge, DrawerBody, DrawerHeader, DrawerHeaderTitle, OverlayDrawer, Tooltip } from '@fluentui/react-components'
import { Dismiss20Regular, PanelRightContract20Regular, PanelRightExpand20Regular, TicketDiagonal20Regular } from '@fluentui/react-icons'
import { MISSIONS } from '../../missions/index.ts'
import { useGame } from '../gameContext.ts'
import { useUnreadTicketMessages } from './useUnreadTicketMessages.ts'
import { QuestPanel } from '../QuestPanel.tsx'

/**
 * The client's ticket, docked on the right (game layer, spec §3). Open it shows the quest panel; closed it's a
 * strip with the stage and unread messages. Below 900 px it's a drawer opened from the header.
 */
export function TicketPane({ narrow }: { narrow: boolean }) {
  const open = useGame(s => s.session.ui.nav.ticketOpen)
  const setOpen = useGame(s => s.setTicketOpen)
  const unread = useUnreadTicketMessages()
  const stage = useGame(s => {
    const m = s.world.mission
    const def = m ? MISSIONS[m.id] : undefined
    return def && m ? def.stages.findIndex(st => st.id === m.stage) + 1 : null
  })

  if (narrow) {
    return (
      <OverlayDrawer open={open} onOpenChange={(_, d) => setOpen(d.open)} position="end" size="medium" className="ticket-drawer">
        <DrawerHeader>
          <DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Close ticket" icon={<Dismiss20Regular />} onClick={() => setOpen(false)} />}>
            Ticket
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody><QuestPanel /></DrawerBody>
      </OverlayDrawer>
    )
  }

  if (!open) {
    return (
      <aside className="ticket-strip" aria-label="Ticket (collapsed)">
        <Tooltip content="Show the ticket" relationship="label">
          <Button appearance="subtle" icon={<PanelRightExpand20Regular />} onClick={() => setOpen(true)} />
        </Tooltip>
        <TicketDiagonal20Regular aria-hidden="true" />
        {stage !== null && <span className="ticket-strip-stage" aria-label={`Stage ${stage}`}>{stage}</span>}
        {unread > 0 && <CounterBadge count={unread} size="small" color="danger" aria-label={`${unread} unread messages`} />}
      </aside>
    )
  }

  return (
    <aside className="ticket-pane" aria-labelledby="quest-title">
      <div className="ticket-pane-bar">
        <span className="ticket-pane-label"><TicketDiagonal20Regular aria-hidden="true" /> Ticket <span className="sim-label">Simulator</span></span>
        <Tooltip content="Hide the ticket" relationship="label">
          <Button appearance="subtle" size="small" icon={<PanelRightContract20Regular />} onClick={() => setOpen(false)} />
        </Tooltip>
      </div>
      <div className="ticket-pane-body"><QuestPanel /></div>
    </aside>
  )
}
