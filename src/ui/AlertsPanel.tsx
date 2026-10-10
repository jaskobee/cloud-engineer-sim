import { formatSimTime } from './format.ts'
import { useGame } from './gameContext.ts'

/** Alerts (MON-24): newest first. The system sets the condition; the user response stays New for now (MON-28s). */
export function AlertsPanel() {
  const fired = useGame(s => s.world.alerts.fired)
  const epochMs = useGame(s => s.world.clock.epochMs)
  const select = useGame(s => s.select)
  const at = (t: number) => {
    const f = formatSimTime(epochMs, t)
    return `${f.day} ${f.time}`
  }

  if (fired.length === 0) {
    return <p className="empty">No alerts. An alert fires here when an alert rule's condition is met, and resolves when it clears.</p>
  }
  const open = fired.filter(a => a.monitorCondition === 'Fired').length
  return (
    <div className="alerts">
      <p className="hint">{open === 0 ? 'Nothing is firing right now.' : `${open} alert${open === 1 ? '' : 's'} firing.`}</p>
      <table className="log">
        <thead>
          <tr>
            <th scope="col">Severity</th><th scope="col">Alert rule</th><th scope="col">Alert condition</th><th scope="col">User response</th>
            <th scope="col">Fired</th><th scope="col">Resolved</th><th scope="col">Failed locations</th>
          </tr>
        </thead>
        <tbody>
          {fired.map(a => (
            <tr key={a.id} className={a.monitorCondition === 'Fired' ? 'alert-row is-fired' : 'alert-row'}>
              <td className="mono">Sev {a.severity}</td>
              <td>
                <button type="button" className="link-button" onClick={() => select(a.alertRuleId)}>{a.alertRuleName}</button>
                {a.description && <span className="alert-desc">{a.description}</span>}
              </td>
              <td><span className={`status status-${a.monitorCondition === 'Fired' ? 'failed' : 'succeeded'}`}>{a.monitorCondition}</span></td>
              <td>{a.userResponse}</td>
              <td className="mono">{at(a.firedAt)}</td>
              <td className="mono">{a.resolvedAt === undefined ? '—' : at(a.resolvedAt)}</td>
              <td>{a.failedLocations.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
