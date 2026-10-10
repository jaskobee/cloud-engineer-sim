import { useContext } from 'react'
import { useGame, GameStoreContext } from '../gameContext.ts'
import { evaluateWatchedFlow, type Verdict } from './graph.ts'

const VERDICT_TEXT: Record<Verdict, string> = {
  allowed: 'Allowed', denied: 'Denied', 'not-modelled': 'Not modelled', unavailable: "Can't be checked right now",
}

/**
 * A watched connection, opened from its line on the canvas. Shows exactly what the flow evaluator
 * decided at each end (IP flow verify, NW-1), in the order traffic meets the NSGs (NSG-7).
 */
export function FlowInspector({ flowId }: { flowId: string }) {
  const flow = useGame(s => s.session.ui.canvas.watched.find(w => w.id === flowId))
  const unwatch = useGame(s => s.unwatchFlow)
  const select = useGame(s => s.select)
  // Re-evaluate when the tenant or runtime changes.
  useGame(s => s.world.tenant)
  useGame(s => s.world.runtime)
  const store = useContext(GameStoreContext)
  if (!flow || !store) {
    return (
      <>
        <h2 className="pane-title">Watched connection</h2>
        <p className="empty">This connection isn't watched any more.</p>
      </>
    )
  }
  const result = evaluateWatchedFlow(store.getState().world, flow)

  return (
    <div className="inspector">
      <p className="pane-title">Watched connection</p>
      <h2 className="inspector-name mono">{flow.protocol.toUpperCase()} {flow.direction === 'Inbound' ? flow.localPort : flow.remotePort}</h2>
      {!result && <p className="empty">The virtual machine for this connection no longer exists.</p>}
      {result && (
        <>
          <div className={`nw-result ${result.verdict === 'allowed' ? 'nw-allowed' : result.verdict === 'denied' ? 'nw-denied' : ''}`} role="status">
            <p className="nw-access">{VERDICT_TEXT[result.verdict]}</p>
            <p className="nw-path">{result.reason}</p>
          </div>
          <dl className="facts">
            <div><dt>Direction</dt><dd>{flow.direction} at the watched VM</dd></div>
            <div><dt>Remote address</dt><dd className="mono">{flow.remoteIp}:{flow.remotePort}</dd></div>
            <div><dt>Local port</dt><dd className="mono">{flow.localPort}</dd></div>
          </dl>
          <h3 className="rules-title">Checked in order</h3>
          <ol className="flow-checks">
            {result.checks.map((c, i) => (
              <li key={i}>
                <span className="flow-check-vm">{c.vmName}, {c.direction.toLowerCase()}</span>
                {c.result.ok ? (
                  <>
                    <span className={c.result.access === 'Access allowed' ? 'access-allow' : 'access-deny'}> {c.result.access}</span>
                    {c.result.verdict.kind === 'decided' && c.result.verdict.stages.map(s => (
                      <span key={s.nsgId} className="flow-stage">
                        {s.association === 'Subnet' ? 'Subnet' : 'Network interface'} NSG{' '}
                        <button type="button" className="link-button" onClick={() => select(s.nsgId)}>{s.nsgName}</button>
                        : {s.ruleName} ({s.priority}, {s.access.toLowerCase()})
                      </span>
                    ))}
                  </>
                ) : (
                  <span className="flow-stage"> {c.result.refusal.message}</span>
                )}
              </li>
            ))}
          </ol>
          <p className="field-hint">The same evaluator answers IP flow verify, so both always agree.</p>
        </>
      )}
      <div className="form-actions">
        <button type="button" className="button" onClick={() => unwatch(flow.id)}>Stop watching</button>
      </div>
    </div>
  )
}
