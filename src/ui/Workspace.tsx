import { lazy, Suspense, useContext, useEffect } from 'react'
import { browserScheduler, startTickLoop } from '../store/tickLoop.ts'
import { browserStorage, readProfile, writeProfile, writeSave } from '../store/persistence.ts'
import { BottomTools } from './BottomTools.tsx'
import { CreatePanel } from './CreatePanel.tsx'
import { Inspector } from './Inspector.tsx'
import { ResourceList } from './ResourceList.tsx'
import { FlowInspector } from './canvas/FlowInspector.tsx'
import { FLOW_SELECTION_PREFIX } from '../store/gameStore.ts'
import { useMediaQuery } from './useMediaQuery.ts'
import { GameStoreContext, useGame } from './gameContext.ts'
import { TimeControls } from './TimeControls.tsx'
import { QuestPanel } from './QuestPanel.tsx'
import { InfoDialog } from './Info.tsx'
import { missionResult, MISSIONS, recordRun, runIdOf } from '../missions/index.ts'

/** React Flow is only loaded where the canvas is shown (wide screens), keeping the first load small. */
const ArchitectureCanvas = lazy(() => import('./canvas/ArchitectureCanvas.tsx').then(m => ({ default: m.ArchitectureCanvas })))

/** The player's desk: quest on the left, architecture in the middle, inspector on the right, tools below. */
export function Workspace() {
  const store = useContext(GameStoreContext)

  useEffect(() => {
    if (!store) return
    const storage = browserStorage()
    const save = () => void writeSave(storage, store.getState().world)
    const stop = startTickLoop(store, browserScheduler, { onAutosave: save })
    // Count a finished mission in the career profile once (step 11).
    const record = () => {
      const world = store.getState().world
      const def = world.mission ? MISSIONS[world.mission.id] : undefined
      const runId = runIdOf(world)
      if (!def || !runId || world.mission?.completedAt === undefined) return
      const profile = readProfile(storage)
      if (profile.runs[runId]) return
      const result = missionResult(def, world)
      if (result) writeProfile(storage, recordRun(profile, runId, { missionId: def.id, mode: world.mission.mode, xp: result.xp.total, badges: result.badges }))
    }
    record()
    const unsubscribe = store.subscribe((state, prev) => {
      if (state.world.mission?.completedAt !== prev.world.mission?.completedAt) record()
    })
    const onHide = () => {
      if (document.visibilityState === 'hidden') save()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', save)
    return () => {
      unsubscribe()
      stop()
      save()
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', save)
    }
  }, [store])

  return (
    <div className="workspace">
      <header className="topbar">
        <div className="topbar-title">
          <span className="brand">Cloud Engineer Simulator</span>
          <TopbarContext />
        </div>
        <TimeControls />
      </header>

      <aside className="pane pane-quest" aria-labelledby="quest-title">
        <QuestPanel />
      </aside>

      <main className="pane pane-canvas" aria-labelledby="canvas-title">
        <h2 id="canvas-title" className="visually-hidden">Architecture</h2>
        <CanvasBody />
      </main>

      <InspectorPane />

      <section className="pane pane-bottom" aria-label="Tools">
        <BottomTools />
      </section>
      <InfoDialog />
    </div>
  )
}

function TopbarContext() {
  const missionId = useGame(s => s.world.mission?.id ?? null)
  const def = missionId ? MISSIONS[missionId] : undefined
  return <span className="topbar-context">{def ? `${def.client.name} · ${def.title}` : 'Sandbox subscription, no client assigned yet'}</span>
}

function CanvasBody() {
  const narrow = useMediaQuery('(max-width: 900px)')
  const startCreate = useGame(s => s.startCreate)
  const hasGroups = useGame(s => Object.keys(s.world.tenant.resourceGroups).length > 0)
  const create = (
    <button type="button" className="button button-primary" onClick={() => startCreate({ kind: hasGroups ? null : 'resourceGroup' })}>
      {hasGroups ? 'Create a resource' : 'Create a resource group'}
    </button>
  )
  if (!hasGroups) {
    return (
      <div className="canvas-empty">
        <p className="canvas-empty-title">Nothing deployed yet</p>
        <p className="empty">Everything you build appears here, inside its resource group and network. Start with a resource group to hold it.</p>
        {create}
      </div>
    )
  }
  // Below 900 px the resource list replaces the canvas (D-5). Both read the same world.
  if (narrow) {
    return (
      <div className="canvas-list">
        <div className="canvas-toolbar">{create}</div>
        <ResourceList />
      </div>
    )
  }
  return (
    <Suspense fallback={<p className="empty">Loading the architecture canvas…</p>}>
      <ArchitectureCanvas />
    </Suspense>
  )
}

/** Remounts when what it shows changes, so each resource or form opens scrolled to the top. */
function InspectorPane() {
  const key = useGame(s => s.session.ui.creating ? `create:${JSON.stringify(s.session.ui.creating)}` : `select:${s.session.ui.selectedId ?? ''}`)
  return (
    <aside key={key} className="pane pane-inspector" aria-label="Inspector">
      <InspectorBody />
    </aside>
  )
}

function InspectorBody() {
  const selected = useGame(s => s.session.ui.selectedId)
  const creating = useGame(s => s.session.ui.creating)
  if (creating) return <CreatePanel request={creating} />
  if (selected?.startsWith(FLOW_SELECTION_PREFIX)) return <FlowInspector flowId={selected.slice(FLOW_SELECTION_PREFIX.length)} />
  if (selected !== null) return <Inspector id={selected} />
  return (
    <>
      <h2 className="pane-title">Inspector</h2>
      <p className="empty">Select a resource to see its settings and what it's connected to.</p>
    </>
  )
}
