import { formatSimTime } from './format.ts'
import { useGame } from './gameContext.ts'

/** Activity log: every control-plane write, newest first, with who did it and when (MON-7, MON-9). */
export function ActivityLogPanel() {
  const entries = useGame(s => s.world.activityLog)
  const epochMs = useGame(s => s.world.clock.epochMs)
  const rows = [...entries].reverse()

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Tools">
        <button type="button" role="tab" id="tab-activity" aria-selected="true" aria-controls="panel-activity" className="tab">
          Activity log
        </button>
      </div>
      <div id="panel-activity" role="tabpanel" aria-labelledby="tab-activity" className="tab-panel">
        {rows.length === 0 ? (
          <p className="empty">
            No operations yet. Every create, change and delete in the subscription is recorded here, with who did it and when.
          </p>
        ) : (
          <table className="log">
            <thead>
              <tr>
                <th scope="col">Operation name</th>
                <th scope="col">Status</th>
                <th scope="col">Time</th>
                <th scope="col">Event initiated by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(e => {
                const at = formatSimTime(epochMs, e.eventTimestamp)
                return (
                  <tr key={e.eventDataId}>
                    <td className="mono">{e.operationName}</td>
                    <td><span className={`status status-${e.status.toLowerCase()}`}>{e.status}</span></td>
                    <td className="mono">{at.day} {at.time}</td>
                    <td>{e.caller}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
