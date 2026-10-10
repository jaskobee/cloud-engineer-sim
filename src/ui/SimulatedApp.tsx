import { useId, useState } from 'react'
import { azure, type Resource, type Workload } from '../engine/index.ts'
import { useGame } from './gameContext.ts'
import { RefusalNotice } from './RefusalNotice.tsx'
import type { Refusal } from '../engine/index.ts'

const STATUS_TEXT = { up: 'Up', degraded: 'Degraded', down: 'Down' } as const

/**
 * The app running on a VM (RUN-1s), its health (RUN-2s) and, for the game API, its players (RUN-3s,
 * RUN-4s). Not an Azure resource: scenario commands set it up, and the numbers are made up.
 */
export function SimulatedApp({ vm }: { vm: Resource }) {
  const key = azure.armKey(vm.id)
  const workload = useGame(s => s.world.external.workloads?.[key])
  const service = useGame(s => s.world.runtime[key]?.service)
  const dispatch = useGame(s => s.dispatch)
  const fieldId = useId()
  const ipId = useId()
  const [kind, setKind] = useState<'none' | Workload['kind']>(workload?.kind ?? 'none')
  const [dbIp, setDbIp] = useState(workload?.kind === 'game-api' ? workload.database.ip : '')
  const [refusal, setRefusal] = useState<Refusal | null>(null)

  const apply = () => {
    const next: Workload | null = kind === 'none' ? null
      : kind === 'postgres' ? { kind: 'postgres', port: 5432 }
      : { kind: 'game-api', port: 443, database: { ip: dbIp.trim(), port: 5432 } }
    const outcome = dispatch({ type: 'scenario/setWorkload', caller: 'scenario', payload: { vmId: vm.id, workload: next } })
    setRefusal(outcome.status === 'refused' ? outcome.refusal : null)
  }

  return (
    <section className="sim-app" aria-labelledby={`${fieldId}-title`}>
      <h3 id={`${fieldId}-title`} className="rules-title">Simulated app</h3>
      <p className="field-hint">What the client runs on this VM. Not an Azure resource: the simulator models it, and its numbers are made up.</p>
      {service && (
        <div className={`sim-app-status status-${service.status}`} role="status">
          <p className="sim-app-state">{STATUS_TEXT[service.status]}</p>
          <p className="sim-app-reason">{service.reason}</p>
        </div>
      )}
      <div className="field">
        <label htmlFor={fieldId}>App</label>
        <select id={fieldId} className="input" value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
          <option value="none">None</option>
          <option value="game-api">Game API (HTTPS 443, needs PostgreSQL)</option>
          <option value="postgres">PostgreSQL (TCP 5432)</option>
        </select>
      </div>
      {kind === 'game-api' && (
        <div className="field">
          <label htmlFor={ipId}>PostgreSQL server's private IP</label>
          <input id={ipId} className="input mono" value={dbIp} placeholder="10.40.2.4" onChange={e => setDbIp(e.target.value)} />
        </div>
      )}
      {refusal && <RefusalNotice refusal={refusal} />}
      <div className="inspector-actions">
        <button type="button" className="button" onClick={apply}>Apply</button>
      </div>
      {workload?.kind === 'game-api' && <Players vm={vm} />}
    </section>
  )
}

/** Live player numbers: re-renders every sim second, so it's kept small and separate. */
function Players({ vm }: { vm: Resource }) {
  const traffic = useGame(s => s.world.traffic?.[azure.armKey(vm.id)])
  const profile = useGame(s => s.world.external.traffic.profile)
  const dispatch = useGame(s => s.dispatch)
  const toggle = () => dispatch({ type: 'scenario/setTraffic', caller: 'scenario', payload: { profile: profile ? null : 'beta-launch' } })
  const c = traffic?.counters
  return (
    <div className="sim-players">
      <dl className="facts">
        <div><dt>Players connected</dt><dd className="mono">{azure.activeSessions(traffic)}</dd></div>
        <div><dt>New this minute</dt><dd className="mono">{c ? `${c.accepted} accepted, ${c.refused} refused` : '0'}</dd></div>
        {c?.refused ? <div><dt>Why refused</dt><dd>{c.refusedReason}</dd></div> : null}
      </dl>
      <div className="inspector-actions">
        <button type="button" className="button" aria-pressed={profile !== null} onClick={toggle}>
          {profile ? 'Stop player traffic' : 'Start player traffic (beta launch)'}
        </button>
      </div>
    </div>
  )
}
