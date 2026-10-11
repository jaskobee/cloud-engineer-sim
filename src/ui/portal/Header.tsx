import { useState } from 'react'
import {
  Avatar,
  Badge,
  Button,
  Combobox,
  CounterBadge,
  Menu,
  MenuItem,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  OptionGroup,
  ToggleButton,
  Tooltip,
} from '@fluentui/react-components'
import { Map20Regular, Navigation20Regular, QuestionCircle20Regular, Settings20Regular, TicketDiagonal20Regular } from '@fluentui/react-icons'
import { INFO_TOPICS } from '../../missions/index.ts'
import { PLAYER_PRINCIPAL } from '../../store/gameStore.ts'
import type { ThemeChoice } from '../../store/persistence.ts'
import { useGame } from '../gameContext.ts'
import { useStableWorld } from './useStableWorld.ts'
import { TimeControls } from '../TimeControls.tsx'
import { searchPortal, type SearchHit } from './services.ts'
import { useThemeChoice } from './themeContext.ts'
import { NotificationsButton } from './Notifications.tsx'

/**
 * The page header (PORTAL-1, PORTAL-1s): menu, product name with the Simulation badge, global search, then
 * the Map toggle, notifications, settings, help, the account, and the sim clock. Only controls that work.
 */
export function Header({ onMenu, narrow, onTicket, ticketBadge }: { onMenu: () => void; narrow: boolean; onTicket: () => void; ticketBadge: number }) {
  const map = useGame(s => s.session.ui.nav.map)
  const toggleMap = useGame(s => s.toggleMap)
  return (
    <header className="portal-header">
      <Tooltip content="Show portal menu" relationship="label">
        <Button appearance="transparent" className="portal-header-button" icon={<Navigation20Regular />} onClick={onMenu} />
      </Tooltip>
      <span className="portal-brand">Cloud Engineer Simulator</span>
      <Badge appearance="outline" className="portal-sim-badge" size="small">Simulation</Badge>
      <GlobalSearch />
      <div className="portal-header-tools">
        <Tooltip content="Map of your infrastructure (simulator)" relationship="description">
          <ToggleButton appearance="transparent" className="portal-header-button" icon={<Map20Regular />} checked={map}
            onClick={() => toggleMap()} aria-label="Map">{narrow ? null : 'Map'}</ToggleButton>
        </Tooltip>
        <NotificationsButton />
        <SettingsMenu />
        <HelpMenu />
        {narrow && (
          <span className="portal-ticket-button">
            <Button appearance="transparent" className="portal-header-button" icon={<TicketDiagonal20Regular />} onClick={onTicket} aria-label="Ticket" />
            {ticketBadge > 0 && <CounterBadge count={ticketBadge} size="small" color="danger" className="portal-header-count" />}
          </span>
        )}
        {!narrow && (
          <Tooltip content={PLAYER_PRINCIPAL} relationship="label">
            <Avatar name="Cloud Engineer" size={28} className="portal-account" />
          </Tooltip>
        )}
      </div>
      <div className="portal-clock"><TimeControls /></div>
    </header>
  )
}

function GlobalSearch() {
  const world = useStableWorld()
  const navigate = useGame(s => s.navigate)
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const hits = searchPortal(query, world)
  const services = hits.filter(h => h.kind === 'service')
  const resources = hits.filter(h => h.kind === 'resource')
  const open = (hit: SearchHit | undefined) => {
    if (!hit) return
    navigate(hit.route)
    setQuery('')
    setListOpen(false)
  }
  const key = (h: SearchHit) => `${h.kind}:${h.label}:${JSON.stringify(h.route)}`
  return (
    <Combobox
      className="portal-search"
      aria-label="Search resources and services"
      placeholder="Search resources and services"
      freeform
      expandIcon={null}
      value={query}
      open={listOpen && query.trim() !== ''}
      onOpenChange={(_, d) => setListOpen(d.open)}
      onChange={e => { setQuery(e.target.value); setListOpen(true) }}
      onOptionSelect={(_, data) => open(hits.find(h => key(h) === data.optionValue))}
      onKeyDown={e => { if (e.key === 'Enter' && hits[0] && !e.defaultPrevented) open(hits[0]) }}
    >
      {services.length > 0 && (
        <OptionGroup label="Services">
          {services.map(h => <Option key={key(h)} value={key(h)} text={h.label}>{h.label}</Option>)}
        </OptionGroup>
      )}
      {resources.length > 0 && (
        <OptionGroup label="Resources">
          {resources.map(h => (
            <Option key={key(h)} value={key(h)} text={h.label}>
              <span className="search-hit"><span>{h.label}</span><span className="search-hit-detail">{h.detail}</span></span>
            </Option>
          ))}
        </OptionGroup>
      )}
      {query.trim() !== '' && hits.length === 0 && <Option disabled value="none" text="No results">No results</Option>}
    </Combobox>
  )
}

function SettingsMenu() {
  const [choice, setChoice] = useThemeChoice()
  return (
    <Menu checkedValues={{ theme: [choice] }} onCheckedValueChange={(_, data) => setChoice((data.checkedItems[0] ?? 'system') as ThemeChoice)}>
      <MenuTrigger disableButtonEnhancement>
        <Tooltip content="Settings" relationship="label">
          <Button appearance="transparent" className="portal-header-button" icon={<Settings20Regular />} />
        </Tooltip>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItemRadio name="theme" value="system">Theme: same as your system</MenuItemRadio>
          <MenuItemRadio name="theme" value="light">Theme: light</MenuItemRadio>
          <MenuItemRadio name="theme" value="dark">Theme: dark</MenuItemRadio>
        </MenuList>
      </MenuPopover>
    </Menu>
  )
}

/** Help: the INFO topics (simulator content, every sentence cited from the register). */
function HelpMenu() {
  const openInfo = useGame(s => s.openInfo)
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Tooltip content="Help: Azure concepts" relationship="label">
          <Button appearance="transparent" className="portal-header-button" icon={<QuestionCircle20Regular />} />
        </Tooltip>
      </MenuTrigger>
      <MenuPopover>
        <MenuList className="help-menu">
          {INFO_TOPICS.map(t => <MenuItem key={t.id} onClick={() => openInfo(t.id)}>{t.title}</MenuItem>)}
        </MenuList>
      </MenuPopover>
    </Menu>
  )
}
