import { useState } from 'react'
import { WORLD_SCHEMA_VERSION, type LoadResult } from '../engine/index.ts'
import { createGameStore, newWorld, type GameStore } from '../store/gameStore.ts'
import { browserStorage, readSave } from '../store/persistence.ts'
import { formatSimTime } from './format.ts'
import { GameStoreContext } from './gameContext.ts'
import { Workspace } from './Workspace.tsx'

function newSeed(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())
}

export function App() {
  const [store, setStore] = useState<GameStore | null>(null)
  const [saved] = useState<LoadResult | null>(() => readSave(browserStorage()))

  if (store) {
    return (
      <GameStoreContext.Provider value={store}>
        <Workspace />
      </GameStoreContext.Provider>
    )
  }

  const start = () => setStore(createGameStore({ world: newWorld(newSeed()) }))
  const resume = saved?.ok ? () => setStore(createGameStore({ world: saved.world })) : null
  const savedAt = saved?.ok ? formatSimTime(saved.world.clock.epochMs, saved.world.clock.now) : null

  return (
    <div className="shell">
      <header className="shell-header">
        <span className="brand">Cloud Engineer Simulator</span>
        <span className="tag">Preview</span>
      </header>

      <main className="shell-main">
        <section className="intro" aria-labelledby="intro-title">
          <h1 id="intro-title">You're the cloud engineer now.</h1>
          <p>
            Learn Azure the way engineers do: take a client ticket, build the infrastructure, deploy it,
            keep it running, and fix it when it breaks.
          </p>
        </section>

        <div className="start-actions">
          <button type="button" className="button button-primary" onClick={start}>
            {resume ? 'Start a new game' : 'Start the game'}
          </button>
          {resume && savedAt && (
            <button type="button" className="button" onClick={resume}>
              Continue from {savedAt.day} {savedAt.time.slice(0, 5)}
            </button>
          )}
        </div>
        {resume && <p className="hint">Starting a new game replaces your saved game at the next autosave.</p>}
        {saved && !saved.ok && (
          <p className="notice" role="status">
            Your saved game couldn't be loaded ({saved.message}) Start a new game to replace it.
          </p>
        )}

        <section className="ticket" aria-label="First client">
          <div className="ticket-row">
            <span className="led led-amber" aria-hidden="true" />
            <span className="ticket-label">Under construction</span>
          </div>
          <h2>PixelForge Games: Launch Day</h2>
          <p>
            A small game studio opens its multiplayer beta on Friday. Their game servers need a secure
            home in Azure, and they need to know before their players do when something goes wrong.
          </p>
        </section>
      </main>

      <footer className="shell-footer">
        <span>Simulation only. No real Azure resources or credentials are ever used.</span>
        <span className="mono">world schema v{WORLD_SCHEMA_VERSION}</span>
      </footer>
    </div>
  )
}
