import { useState } from 'react'
import { Badge, Button, Input, ToolbarButton } from '@fluentui/react-components'
import { Add20Regular, ArrowClockwise20Regular, Filter20Regular } from '@fluentui/react-icons'
import { useGame } from '../gameContext.ts'
import { kindForType } from '../resourceKinds.ts'
import { browseRows } from './browse.ts'
import { PageFrame } from './PageFrame.tsx'
import { browseLabel } from './route.ts'
import { TypeIcon } from './ServiceIcon.tsx'

/** A service list (PORTAL-5, PORTAL-6, PORTAL-8): + Create, Refresh, a filter and the grid. */
export function BrowsePage({ type }: { type: string }) {
  const world = useGame(s => s.world)
  const navigate = useGame(s => s.navigate)
  const startCreate = useGame(s => s.startCreate)
  const [filter, setFilter] = useState('')
  const [, refresh] = useState(0)
  const rows = browseRows(type, world).filter(r => r.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const kind = kindForType(type)
  const label = browseLabel(type)
  const iconType = type.toLowerCase() === 'resourcegroups' ? 'resourcegroup' : type
  return (
    <PageFrame title={label} icon={<TypeIcon type={iconType} />} commands={<>
      {kind && <ToolbarButton icon={<Add20Regular />} onClick={() => startCreate({ kind })} data-guide={`create:${kind}`}>Create</ToolbarButton>}
      <ToolbarButton icon={<ArrowClockwise20Regular />} onClick={() => refresh(n => n + 1)}>Refresh</ToolbarButton>
    </>}>
      <Input className="browse-filter" contentBefore={<Filter20Regular />} placeholder="Filter by name" value={filter}
        onChange={(_, d) => setFilter(d.value)} aria-label={`Filter ${label.toLowerCase()}`} />
      <p className="browse-count">{rows.length} item{rows.length === 1 ? '' : 's'}</p>
      {rows.length === 0 ? <p className="empty">No {label.toLowerCase()} to display.</p> : (
        <div className="grid-scroll">
          <table className="grid">
            <thead>
              <tr><th scope="col">Name</th><th scope="col">Resource group</th><th scope="col">Location</th><th scope="col">Subscription</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <Button appearance="transparent" className="grid-link" icon={<TypeIcon type={iconType} />}
                      onClick={() => navigate({ page: 'resource', id: r.id, section: 'overview' })} data-guide={`resource:${r.name}`}>
                      {r.name}
                    </Button>
                    {r.state !== 'Succeeded' && <Badge appearance="tint" color="warning" size="small">{r.state}…</Badge>}
                  </td>
                  <td>{r.resourceGroup}</td>
                  <td>{r.location}</td>
                  <td>{r.subscription}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageFrame>
  )
}
