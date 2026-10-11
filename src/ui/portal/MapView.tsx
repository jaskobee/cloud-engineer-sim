import { lazy, Suspense } from 'react'
import { useMediaQuery } from '../useMediaQuery.ts'
import { ResourceList } from '../ResourceList.tsx'
import type { CanvasScope } from '../canvas/graph.ts'

/** React Flow is only loaded where the map is shown, keeping the first load small. */
const ArchitectureCanvas = lazy(() => import('../canvas/ArchitectureCanvas.tsx').then(m => ({ default: m.ArchitectureCanvas })))

/**
 * The architecture map (simulator, D-5): the Map toggle, Network Watcher > Topology and Virtual network >
 * Diagram all show it. Below 900 px the resource list replaces it (D-5 rule 5).
 */
export function MapView({ scope = null }: { scope?: CanvasScope } = {}) {
  const narrow = useMediaQuery('(max-width: 900px)')
  if (narrow) return <div className="map-list"><ResourceList /></div>
  return (
    <div className="map-view">
      <Suspense fallback={<p className="empty">Loading the map…</p>}>
        <ArchitectureCanvas scope={scope} />
      </Suspense>
    </div>
  )
}
