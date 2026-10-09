import { azure } from '../engine/index.ts'
import { formatDuration, formatSimTime } from './format.ts'
import { useGame } from './gameContext.ts'
import { typeLabel } from './resourceKinds.ts'

/**
 * The resource group's deployment history (ARM-10): one deployment per write (ARM-12s), newest first.
 * Durations are made up and game-paced (ARM-13s), and the panel says so.
 */
export function DeploymentsPanel() {
  const deployments = useGame(s => s.world.deployments)
  const now = useGame(s => s.world.clock.now)
  const epochMs = useGame(s => s.world.clock.epochMs)
  const resources = useGame(s => s.world.tenant.resources)
  const select = useGame(s => s.select)
  const rows = Object.values(deployments).sort((a, b) => b.startedAt - a.startedAt || b.id.localeCompare(a.id))

  if (rows.length === 0) {
    return (
      <p className="empty">
        No deployments yet. Every resource you create, change or delete is deployed here, and you can watch it until it succeeds.
      </p>
    )
  }
  return (
    <div className="deployments">
      <p className="hint">Provisioning times in the simulator are made up and shortened. Real ones vary.</p>
      <div className="table-scroll">
        <table className="log deployments-table">
          <thead>
            <tr>
              <th scope="col">Deployment name</th>
              <th scope="col">Status</th>
              <th scope="col">Resource</th>
              <th scope="col">Start time</th>
              <th scope="col">Duration</th>
              <th scope="col">Initiated by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(d => {
              const at = formatSimTime(epochMs, d.startedAt)
              const target = d.operation.targetResourceId
              const exists = resources[azure.armKey(target)] !== undefined
              const name = target.split('/').at(-1) ?? target
              const elapsed = (d.completedAt ?? now) - d.startedAt
              return (
                <tr key={d.id}>
                  <td className="mono">{d.name}</td>
                  <td>
                    <span className={`status status-${d.provisioningState.toLowerCase()}`}>
                      {d.provisioningState === 'Running' ? 'Deployment in progress' : d.provisioningState}
                    </span>
                  </td>
                  <td>
                    {exists
                      ? <button type="button" className="link-button" onClick={() => select(target)}>{name}</button>
                      : name}
                    <span className="deployment-type"> · {typeLabel(d.operation.operationName.replace(/\/(write|delete)$/, ''))}{d.operation.deleted.length > 0 ? ' (delete)' : ''}</span>
                  </td>
                  <td className="mono">{at.day} {at.time}</td>
                  <td className="mono">{formatDuration(elapsed)}{d.provisioningState === 'Running' ? ' so far' : ''}</td>
                  <td>{d.caller}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
