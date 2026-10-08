import { useEffect, useRef, useState } from 'react'
import type { ArmId, Refusal } from '../engine/index.ts'
import type { PlayerCommand } from '../store/gameStore.ts'
import { useGame } from './gameContext.ts'
import { RefusalNotice } from './RefusalNotice.tsx'

interface Props {
  command: PlayerCommand
  /** What the player is about to create, shown after validation passes. */
  summary: [string, string][]
  /** Selected after a successful create. */
  targetId: ArmId | null
  /** "Create" or "Save" for an update. */
  verb?: string
}

/**
 * The portal's Review + create step: validate first (a dry run of the same command), show what
 * will be created, then create. Nothing changes until the player confirms. Editing any field
 * after a review sends the player back to review again.
 */
export function ReviewCreate({ command, summary, targetId, verb = 'Create' }: Props) {
  const check = useGame(s => s.check)
  const dispatch = useGame(s => s.dispatch)
  const select = useGame(s => s.select)
  const startCreate = useGame(s => s.startCreate)
  const key = JSON.stringify(command)
  const [review, setReview] = useState<{ key: string; refusal: Refusal | null } | null>(null)
  const current = review?.key === key ? review : null
  const resultRef = useRef<HTMLDivElement>(null)

  // The result is the point of the review: bring it (and the Create button) into view.
  useEffect(() => {
    if (review) resultRef.current?.scrollIntoView({ block: 'nearest' })
  }, [review])

  const runReview = () => setReview({ key, refusal: check(command) })
  const create = () => {
    const outcome = dispatch(command)
    if (outcome.status === 'refused') setReview({ key, refusal: outcome.refusal })
    else if (targetId) select(targetId)
    else startCreate(null)
  }

  return (
    <div className="review" ref={resultRef}>
      {current?.refusal && <RefusalNotice refusal={current.refusal} />}
      {current && current.refusal === null && (
        <div className="review-passed" role="status">
          <p className="review-passed-title">Validation passed</p>
          <dl className="facts">
            {summary.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <div className="form-actions">
        {current && current.refusal === null ? (
          <button type="button" className="button button-primary" onClick={create}>{verb}</button>
        ) : (
          <button type="button" className="button button-primary" onClick={runReview}>Review + {verb.toLowerCase()}</button>
        )}
        <button type="button" className="button" onClick={() => startCreate(null)}>Cancel</button>
      </div>
    </div>
  )
}
