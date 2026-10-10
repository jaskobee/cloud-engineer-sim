import { useState } from 'react'
import { ASSISTANCE_MODES, WORLD_SCHEMA_VERSION, type AssistanceMode, type LoadResult } from '../engine/index.ts'
import { PIXELFORGE_LAUNCH_DAY, registryFor, startMission } from '../missions/index.ts'
import { createGameStore, newWorld, type GameStore } from '../store/gameStore.ts'
import { browserStorage, readSave } from '../store/persistence.ts'
import { formatSimTime } from './format.ts'
import { GameStoreContext } from './gameContext.ts'
import { MODE_TEXT } from './modes.ts'
import { Workspace } from './Workspace.tsx'

function newSeed(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())
}

export function App() {
  const [store, setStore] = useState<GameStore | null>(null)
  const [saved] = useState<LoadResult | null>(() => readSave(browserStorage()))
  const [mode, setMode] = useState<AssistanceMode>('guided')

  if (store) {
    return (
      <GameStoreContext.Provider value={store}>
        <Workspace />
      </GameStoreContext.Provider>
    )
  }

  const mission = PIXELFORGE_LAUNCH_DAY
  const startMissionGame = () => setStore(createGameStore({ world: startMission(mission, newSeed(), registryFor(mission), mode) }))
  const startSandbox = () => setStore(createGameStore({ world: newWorld(newSeed()) }))
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

        {resume && savedAt && (
          <div className="start-actions">
            <button type="button" className="button button-primary" onClick={resume}>
              Continue from {savedAt.day} {savedAt.time.slice(0, 5)}
            </button>
          </div>
        )}
        {saved && !saved.ok && (
          <p className="notice" role="status">
            Your saved game couldn't be loaded ({saved.message}) Start a new game to replace it.
          </p>
        )}

        <section className="ticket" aria-labelledby="mission-title">
          <div className="ticket-row">
            <span className="led led-green" aria-hidden="true" />
            <span className="ticket-label">First client · {mission.client.name}</span>
          </div>
          <h2 id="mission-title">{mission.title}</h2>
          <p>
            A small game studio opens its multiplayer beta on Friday. Their game servers need a secure
            home in Azure, and they need to know before their players do when something goes wrong.
          </p>
          <fieldset className="mode-pick">
            <legend>How much help do you want?</legend>
            {ASSISTANCE_MODES.map(m => (
              <label key={m} className={`mode-option${mode === m ? ' is-selected' : ''}`}>
                <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                <span className="mode-label">{MODE_TEXT[m].label}</span>
                <span className="mode-blurb">{MODE_TEXT[m].blurb}</span>
              </label>
            ))}
          </fieldset>
          <div className="start-actions">
            <button type="button" className="button button-primary" onClick={startMissionGame}>Take the job</button>
            <button type="button" className="button" onClick={startSandbox}>Open an empty sandbox</button>
          </div>
          {resume && <p className="hint">Starting something new replaces your saved game at the next autosave.</p>}
        </section>
      </main>

      <footer className="shell-footer">
        <span>Simulation only. No real Azure resources or credentials are ever used.</span>
        <span className="mono">world schema v{WORLD_SCHEMA_VERSION}</span>
      </footer>
    </div>
  )
}
