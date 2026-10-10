import { useContext, useId, useMemo, useState } from 'react'
import { ASSISTANCE_MODES, type AssistanceMode, type MissionMessage, type Refusal } from '../engine/index.ts'
import { hintsUsed, judgeReport, MISSIONS, objectiveStatus, type MissionDef, type ObjectiveDef, type StageDef } from '../missions/index.ts'
import { formatSimTime } from './format.ts'
import { GameStoreContext, useGame } from './gameContext.ts'
import { MODE_TEXT } from './modes.ts'
import { RefusalNotice } from './RefusalNotice.tsx'

/**
 * The quest panel (step 10): the client's ticket and messages, where the mission is, what's left to do,
 * hints and the post-incident note. Everything is read from the world: objective status is derived by
 * the mission's checks, and every action is a mission command.
 */
export function QuestPanel() {
  const missionId = useGame(s => s.world.mission?.id ?? null)
  const def = missionId ? MISSIONS[missionId] : undefined
  if (!def) {
    return (
      <>
        <h2 id="quest-title" className="pane-title">Sandbox</h2>
        <p className="empty">No client in the sandbox. Build anything you like; start a mission from the start screen to get a ticket.</p>
      </>
    )
  }
  return <MissionQuest def={def} />
}

function MissionQuest({ def }: { def: MissionDef }) {
  const stageId = useGame(s => s.world.mission?.stage)
  const mode = useGame(s => s.world.mission?.mode ?? 'guided')
  const completed = useGame(s => s.world.mission?.completedAt !== undefined)
  const stage = def.stages.find(s => s.id === stageId)
  if (!stage) return null
  const index = def.stages.indexOf(stage)
  return (
    <div className="quest">
      <p className="quest-client">{def.client.name}</p>
      <h2 id="quest-title" className="quest-title">{def.title}</h2>
      <ol className="quest-stages" aria-label="Mission stages">
        {def.stages.map((s, i) => (
          <li key={s.id} className={i < index || completed ? 'is-done' : i === index ? 'is-current' : ''} aria-current={i === index ? 'step' : undefined}>
            <span className="quest-stage-mark" aria-hidden="true">{i < index || (completed && i === index) ? '✓' : i + 1}</span>
            <span>{s.title}</span>
          </li>
        ))}
      </ol>
      <section className="quest-goal" aria-label="Current stage">
        <p className="quest-goal-title">Stage {index + 1} of {def.stages.length}: {stage.title}</p>
        <p>{stage.goal}</p>
      </section>
      <Inbox def={def} />
      {stage.hints && stage.hints.length > 0 && <Hints hintKey={`stage/${stage.id}`} hints={stage.hints} mode={mode} />}
      {stage.objectives.length > 0 && <Objectives def={def} stage={stage} mode={mode} />}
      {stage.acceptsReport && <ReportForm def={def} mode={mode} />}
      {completed && <Completion def={def} />}
      <ModeSwitch mode={mode} />
    </div>
  )
}

/** Objective status, recomputed when the infrastructure or the apps change, not on every tick. */
function useObjectiveStatus(def: MissionDef) {
  const tenant = useGame(s => s.world.tenant)
  const runtime = useGame(s => s.world.runtime)
  const external = useGame(s => s.world.external)
  const store = useContext(GameStoreContext)
  return useMemo(() => {
    if (!store) return []
    return objectiveStatus(def, store.getState().world)
    // tenant, runtime and external are what the checks read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, tenant, runtime, external, store])
}

function Objectives({ def, stage, mode }: { def: MissionDef; stage: StageDef; mode: AssistanceMode }) {
  const status = useObjectiveStatus(def)
  const shown = stage.objectives.map(id => def.objectives.find(o => o.id === id)).filter((o): o is ObjectiveDef => !!o)
  const ok = (id: string) => status.find(s => s.id === id)?.ok === true
  const met = shown.filter(o => ok(o.id)).length
  const next = shown.find(o => !ok(o.id))?.id

  if (mode === 'expert') {
    return (
      <section className="quest-section" aria-label="Objectives">
        <h3 className="quest-heading">Acceptance</h3>
        <p className="quest-count">{met} of {shown.length} requirements met</p>
        <p className="hint">Expert mode: the ticket is your specification. The requirements are checked, but not listed.</p>
      </section>
    )
  }
  return (
    <section className="quest-section" aria-label="Objectives">
      <h3 className="quest-heading">{mode === 'guided' ? 'Requirements' : 'Acceptance criteria'} <span className="quest-count">{met}/{shown.length}</span></h3>
      <ul className="objectives">
        {shown.map(o => {
          const s = status.find(x => x.id === o.id)
          const done = s?.ok === true
          const isNext = mode === 'guided' && o.id === next
          return (
            <li key={o.id} className={`objective${done ? ' is-done' : ''}${isNext ? ' is-next' : ''}`}>
              <span className="objective-mark" aria-hidden="true">{done ? '✓' : '○'}</span>
              <div className="objective-body">
                <p className="objective-title">
                  {o.title}
                  <span className="visually-hidden">{done ? ' (met)' : ' (not met yet)'}</span>
                  {isNext && <span className="objective-next">Next</span>}
                </p>
                {mode === 'guided' && <p className="objective-technical">{o.technical}</p>}
                {mode === 'guided' && s && <p className={`objective-detail ${done ? 'is-ok' : ''}`}>{s.detail}</p>}
                {!done && <Hints hintKey={o.id} hints={o.hints} mode={mode} compact />}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** A hint ladder: direction → concept → resource → action → exact step (MVP §30). */
function Hints({ hintKey, hints, mode, compact = false }: { hintKey: string; hints: readonly string[]; mode: AssistanceMode; compact?: boolean }) {
  const opened = useGame(s => s.world.mission?.hints[hintKey] ?? 0)
  const dispatch = useGame(s => s.dispatch)
  const shown = hints.slice(0, opened)
  const more = opened < hints.length
  return (
    <div className={compact ? 'hints is-compact' : 'hints quest-section'}>
      {!compact && <h3 className="quest-heading">Hints</h3>}
      {shown.length > 0 && (
        <ol className="hint-list">
          {shown.map((h, i) => <li key={i}>{h}</li>)}
        </ol>
      )}
      {more && (
        <button type="button" className="link-button" onClick={() => dispatch({ type: 'mission/revealHint', payload: { key: hintKey } })}>
          {opened === 0 ? 'Show a hint' : 'Show the next hint'} ({opened + 1} of {hints.length}){mode === 'expert' ? ', counted' : ''}
        </button>
      )}
    </div>
  )
}

function ReportForm({ def, mode }: { def: MissionDef; mode: AssistanceMode }) {
  const dispatch = useGame(s => s.dispatch)
  const report = useGame(s => s.world.mission?.report)
  const attempts = useGame(s => s.world.mission?.reportAttempts ?? 0)
  const [rootCause, setRootCause] = useState(report?.rootCause ?? '')
  const [evidence, setEvidence] = useState<string[]>(report?.evidence ?? [])
  const [lesson, setLesson] = useState(report?.lesson ?? '')
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const id = useId()
  const verdict = report ? judgeReport(def.report, report) : null
  const toggle = (e: string) => setEvidence(list => (list.includes(e) ? list.filter(x => x !== e) : [...list, e]))
  const submit = () => {
    const outcome = dispatch({ type: 'mission/submitReport', payload: { rootCause, evidence, lesson } })
    setRefusal(outcome.status === 'refused' ? outcome.refusal : null)
  }

  return (
    <section className="quest-section report" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="quest-heading">Post-incident note</h3>
      <fieldset className="report-group">
        <legend>What broke?</legend>
        {def.report.rootCauses.map(o => (
          <label key={o.id} className="check">
            <input type="radio" name={`${id}-cause`} checked={rootCause === o.id} onChange={() => setRootCause(o.id)} />
            <span>{o.text}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="report-group">
        <legend>How do you know? Pick the evidence that supports it.</legend>
        {def.report.evidence.map(o => (
          <label key={o.id} className="check">
            <input type="checkbox" checked={evidence.includes(o.id)} onChange={() => toggle(o.id)} />
            <span>{o.text}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="report-group">
        <legend>What should Jonas take away?</legend>
        {def.report.lessons.map(o => (
          <label key={o.id} className="check">
            <input type="radio" name={`${id}-lesson`} checked={lesson === o.id} onChange={() => setLesson(o.id)} />
            <span>{o.text}</span>
          </label>
        ))}
      </fieldset>
      {refusal && <RefusalNotice refusal={refusal} />}
      {verdict && !verdict.correct && (
        <div className="report-feedback" role="status">
          <p className="report-feedback-title">Lena has questions (attempt {attempts})</p>
          {mode === 'expert' ? (
            <p>Something in the note doesn't add up yet.</p>
          ) : (
            <ul>
              {!verdict.rootCause && <li>The root cause doesn't match what happened.</li>}
              {verdict.evidence.wrong > 0 && <li>{verdict.evidence.wrong === 1 ? 'One piece' : `${verdict.evidence.wrong} pieces`} of evidence didn't happen in this incident.</li>}
              {verdict.evidence.right < def.report.minEvidence && <li>Give at least {def.report.minEvidence} pieces of evidence that show the cause.</li>}
              {!verdict.lesson && <li>The lesson for Jonas isn't right.</li>}
            </ul>
          )}
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="button button-primary" onClick={submit} disabled={!rootCause || !lesson || evidence.length === 0}>Send to Lena</button>
      </div>
    </section>
  )
}

function Completion({ def }: { def: MissionDef }) {
  const hints = useGame(s => hintsUsed(s.world))
  const attempts = useGame(s => s.world.mission?.reportAttempts ?? 0)
  const mode = useGame(s => s.world.mission?.mode ?? 'guided')
  const last = def.stages.at(-1)
  return (
    <section className="quest-section quest-complete" aria-label="Mission complete">
      <p className="quest-complete-title">Mission complete</p>
      <p>{last?.goal}</p>
      <dl className="facts">
        <div><dt>Mode</dt><dd>{MODE_TEXT[mode].label}</dd></div>
        <div><dt>Hints opened</dt><dd>{hints}</dd></div>
        <div><dt>Incident notes sent</dt><dd>{attempts}</dd></div>
      </dl>
    </section>
  )
}

function Inbox({ def }: { def: MissionDef }) {
  const messages = useGame(s => s.world.mission?.messages)
  const epochMs = useGame(s => s.world.clock.epochMs)
  const seen = useGame(s => s.session.ui.seenMessages)
  const markSeen = useGame(s => s.markMessagesSeen)
  if (!messages) return null
  const unread = Math.max(0, messages.length - seen)
  const actor = (id: string) => def.actors.find(a => a.id === id)
  const newest = [...messages].map((m, i) => ({ m, i })).reverse()
  return (
    <section className="quest-section" aria-label="Messages">
      <h3 className="quest-heading">
        Messages{unread > 0 && <span className="tab-badge">{unread}<span className="visually-hidden"> new</span></span>}
      </h3>
      {unread > 0 && <button type="button" className="link-button" onClick={() => markSeen(messages.length)}>Mark all as read</button>}
      <ul className="inbox">
        {newest.map(({ m, i }) => (
          <Message key={m.id} message={m} isNew={i >= seen} open={i >= seen || i === messages.length - 1} from={actor(m.from)} epochMs={epochMs} />
        ))}
      </ul>
    </section>
  )
}

function Message({ message, isNew, open, from, epochMs }: {
  message: MissionMessage; isNew: boolean; open: boolean; from: MissionDef['actors'][number] | undefined; epochMs: number
}) {
  const at = formatSimTime(epochMs, message.at)
  return (
    <li className={`message${isNew ? ' is-new' : ''}`}>
      <details open={open}>
        <summary>
          <span className="message-subject">{message.subject ?? '(no subject)'}</span>
          {isNew && <span className="message-new">New</span>}
          <span className="message-meta">{from?.displayName ?? message.from} · {at.day} {at.time.slice(0, 5)}</span>
        </summary>
        {from && <p className="message-role">{from.role}</p>}
        {message.body.split('\n\n').map((p, i) => <p key={i} className="message-body">{p}</p>)}
      </details>
    </li>
  )
}

function ModeSwitch({ mode }: { mode: AssistanceMode }) {
  const dispatch = useGame(s => s.dispatch)
  const id = useId()
  return (
    <div className="field quest-mode">
      <label htmlFor={id}>Assistance</label>
      <select id={id} className="input" value={mode} onChange={e => dispatch({ type: 'mission/setMode', payload: { mode: e.target.value } })}>
        {ASSISTANCE_MODES.map(m => <option key={m} value={m}>{MODE_TEXT[m].label}</option>)}
      </select>
      <p className="field-hint">{MODE_TEXT[mode].blurb}</p>
    </div>
  )
}
