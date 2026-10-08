import type { Refusal } from '../engine/index.ts'
import { ruleInfo } from './facts.ts'

/**
 * Why something was refused, and where the rule comes from. Two different messages: Azure itself
 * refuses it (a rule from Learn), or the simulator doesn't model the case and won't guess.
 */
export function RefusalNotice({ refusal }: { refusal: Refusal }) {
  if (refusal.kind === 'invalid') {
    return (
      <div className="refusal refusal-invalid" role="alert">
        <p className="refusal-title">This can't be submitted</p>
        <p>{refusal.message}</p>
      </div>
    )
  }

  const info = ruleInfo(refusal.ruleId)
  const modelled = refusal.kind === 'rule'
  return (
    <div className={`refusal ${modelled ? 'refusal-rule' : 'refusal-unmodelled'}`} role="alert">
      <p className="refusal-title">{modelled ? 'Azure won\'t accept this' : 'The simulator doesn\'t model this yet'}</p>
      <p>{refusal.message}</p>
      <p className="refusal-source">
        <span className="mono">{refusal.ruleId}</span>
        {info?.sources.map(s => (
          <a key={s.key} href={s.url} target="_blank" rel="noreferrer">
            {s.title}
          </a>
        ))}
        {!modelled && !info?.sources.length && <span>Microsoft Learn doesn't settle this case, so the simulator refuses instead of guessing.</span>}
      </p>
    </div>
  )
}
