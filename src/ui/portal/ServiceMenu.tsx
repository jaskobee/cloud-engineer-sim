import { useState } from 'react'
import { Input } from '@fluentui/react-components'
import { ChevronDown16Regular, ChevronRight16Regular, Search16Regular } from '@fluentui/react-icons'
import type { MenuGroup } from './menus.ts'

/**
 * The service menu (PORTAL-3): a search box, then items, some in collapsible groups. Below 900 px the page
 * shows it as a dropdown instead (see `ServiceMenuSelect`).
 */
export function ServiceMenu({ groups, current, onSelect, label }: { groups: MenuGroup[]; current: string; onSelect: (id: string) => void; label: string }) {
  const [query, setQuery] = useState('')
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const q = query.trim().toLowerCase()
  const toggle = (g: string) => setClosed(c => {
    const next = new Set(c)
    if (next.has(g)) next.delete(g)
    else next.add(g)
    return next
  })
  return (
    <nav className="service-menu" aria-label={`${label} menu`}>
      <Input size="small" className="service-menu-search" contentBefore={<Search16Regular />} placeholder="Search" value={query}
        onChange={(_, d) => setQuery(d.value)} aria-label="Search the menu" />
      {groups.map((g, gi) => {
        const items = g.items.filter(i => !q || i.label.toLowerCase().includes(q))
        if (items.length === 0) return null
        const isClosed = g.label !== null && closed.has(g.label) && !q
        return (
          <div key={g.label ?? `top-${gi}`} className="service-menu-group">
            {g.label !== null && (
              <button type="button" className="service-menu-group-label" aria-expanded={!isClosed} onClick={() => toggle(g.label ?? '')}>
                {isClosed ? <ChevronRight16Regular aria-hidden="true" /> : <ChevronDown16Regular aria-hidden="true" />}
                {g.label}
              </button>
            )}
            {!isClosed && (
              <ul>
                {items.map(i => (
                  <li key={i.id}>
                    <button type="button" className={`service-menu-item ${g.label ? 'is-grouped' : ''}`} aria-current={i.id === current ? 'page' : undefined}
                      onClick={() => onSelect(i.id)} data-guide={`menu:${i.id}`}>
                      {i.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )
}

/** The service menu on narrow screens: a native select of the same items. */
export function ServiceMenuSelect({ groups, current, onSelect, label }: { groups: MenuGroup[]; current: string; onSelect: (id: string) => void; label: string }) {
  return (
    <label className="service-menu-select">
      <span className="visually-hidden">{label} menu</span>
      <select value={current} onChange={e => onSelect(e.target.value)}>
        {groups.map((g, gi) => g.label === null
          ? g.items.map(i => <option key={i.id} value={i.id}>{i.label}</option>)
          : <optgroup key={g.label ?? gi} label={g.label}>{g.items.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}</optgroup>)}
      </select>
    </label>
  )
}
