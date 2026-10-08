import { useContext, useEffect } from 'react'
import { browserScheduler, startTickLoop } from '../store/tickLoop.ts'
import { browserStorage, writeSave } from '../store/persistence.ts'
import { ActivityLogPanel } from './ActivityLogPanel.tsx'
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
          <span className="topbar-context">Sandbox, no client assigned yet</span>
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
        <div className="canvas-empty">
          <p className="canvas-empty-title">Nothing deployed yet</p>
          <p className="empty">Everything you build appears here, inside its resource group and network, coloured by its health.</p>
        </div>
      </main>

      <aside className="pane pane-inspector" aria-labelledby="inspector-title">
        <h2 id="inspector-title" className="pane-title">Inspector</h2>
        <InspectorBody />
      </aside>

      <section className="pane pane-bottom" aria-label="Tools">
        <ActivityLogPanel />
      </section>
    </div>
  )
}

function InspectorBody() {
  const selected = useGame(s => s.session.ui.selectedId)
  if (selected === null) {
    return <p className="empty">Select a resource to see its settings, its health and what depends on it.</p>
  }
  return <p className="mono">{selected}</p>
}
