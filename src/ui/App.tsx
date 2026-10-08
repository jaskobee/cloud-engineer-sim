import { WORLD_SCHEMA_VERSION } from '../engine/index.ts'

/**
 * Placeholder shell (step 1). The real workspace (quest panel, architecture canvas,
 * inspector, bottom panels) replaces this from step 3 onwards.
 */
export function App() {
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
