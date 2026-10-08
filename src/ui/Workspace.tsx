import { useContext, useEffect } from 'react'
import { browserScheduler, startTickLoop } from '../store/tickLoop.ts'
import { browserStorage, writeSave } from '../store/persistence.ts'
import { ActivityLogPanel } from './ActivityLogPanel.tsx'
import { CreatePanel } from './CreatePanel.tsx'
import { Inspector } from './Inspector.tsx'
import { ResourceList } from './ResourceList.tsx'
import { GameStoreContext, useGame } from './gameContext.ts'
import { TimeControls } from './TimeControls.tsx'

/** The player's desk: quest on the left, architecture in the middle, inspector on the right, tools below. */
export function Workspace() {
  const store = useContext(GameStoreContext)

  useEffect(() => {
    if (!store) return
    const storage = browserStorage()
    const save = () => void writeSave(storage, store.getState().world)
    const stop = startTickLoop(store, browserScheduler, { onAutosave: save })
    const onHide = () => {
      if (document.visibilityState === 'hidden') save()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', save)
    return () => {
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
          <span className="topbar-context">Sandbox subscription, no client assigned yet</span>
        </div>
        <TimeControls />
      </header>

      <aside className="pane pane-quest" aria-labelledby="quest-title">
        <h2 id="quest-title" className="pane-title">Ticket</h2>
        <p className="empty">
          No ticket yet. Client tickets land here with what the client needs, what's done and what's next.
        </p>
      </aside>

      <main className="pane pane-canvas" aria-labelledby="canvas-title">
        <h2 id="canvas-title" className="visually-hidden">Architecture</h2>
        <CanvasBody />
      </main>

      <InspectorPane />

      <section className="pane pane-bottom" aria-label="Tools">
        <ActivityLogPanel />
      </section>
    </div>
  )
}

function CanvasBody() {
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
  return (
    <div className="canvas-list">
      <div className="canvas-toolbar">{create}</div>
      <ResourceList />
    </div>
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
  if (selected !== null) return <Inspector id={selected} />
  return (
    <>
      <h2 className="pane-title">Inspector</h2>
      <p className="empty">Select a resource to see its settings and what it's connected to.</p>
    </>
  )
}
