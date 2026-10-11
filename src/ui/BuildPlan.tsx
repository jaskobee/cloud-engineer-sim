import { useContext, useMemo } from 'react'
import { azure, creatorOf, type World } from '../engine/index.ts'
import { currentBuildStep, type BuildPlan as Plan, type BuildStep, type MissionDef } from '../missions/index.ts'
import { PLAYER_PRINCIPAL } from '../store/gameStore.ts'
import { ruleInfo } from './facts.ts'
import { GameStoreContext, useGame } from './gameContext.ts'
import { callerLabel } from './portal/callers.ts'
import { PortalPath } from './portal/PortalPath.tsx'

/**
 * Guided mode's build plan (D-8): what to create, in which order, with which values and why. The current step is
 * open with its portal path (the next control glows); done steps tick by relationships, never by name.
 */
export function BuildPlan({ def, plan }: { def: MissionDef; plan: Plan }) {
  const tenant = useGame(s => s.world.tenant)
  const runtime = useGame(s => s.world.runtime)
  const activityLog = useGame(s => s.world.activityLog)
  const store = useContext(GameStoreContext)
  const { done, current, existing } = useMemo(() => {
    const world = store?.getState().world
    if (!world) return { done: [] as boolean[], current: 0, existing: [] as Existing[] }
    return { done: plan.steps.map(s => s.done(world)), current: currentBuildStep(plan, world), existing: alreadyThere(world) }
    // tenant, runtime and the activity log are what the steps and Created by read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, store, tenant, runtime, activityLog])

  return (
    <section className="quest-section build-plan" aria-labelledby="build-plan-title">
      <h3 id="build-plan-title" className="quest-heading">
        Build plan <span className="quest-count">{done.filter(Boolean).length}/{plan.steps.length}</span>
      </h3>
      <p className="build-plan-intro">{plan.intro}</p>
      {existing.length > 0 && (
        <div className="build-existing">
          <p className="build-existing-title">Already in the subscription (not yours to change)</p>
          <ul>
            {existing.map(e => (
              <li key={e.id}>
                <span className="mono">{e.name}</span> · {e.location} · {e.resources} resource{e.resources === 1 ? '' : 's'} · created by {e.createdBy}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ol className="build-steps">
        {plan.steps.map((step, i) => (
          <li key={step.id} className={`build-step${done[i] ? ' is-done' : ''}${i === current ? ' is-current' : ''}`} aria-current={i === current ? 'step' : undefined}>
            <details key={`${step.id}:${i === current}`} open={i === current}>
              <summary>
                <span className="build-step-mark" aria-hidden="true">{done[i] ? '✓' : i + 1}</span>
                <span className="build-step-title">{step.title}</span>
                <span className="visually-hidden">{done[i] ? ' (done)' : i === current ? ' (next)' : ''}</span>
                {i === current && <span className="objective-next">Next</span>}
              </summary>
              <StepBody def={def} step={step} highlight={i === current} />
            </details>
          </li>
        ))}
      </ol>
      {current >= plan.steps.length && <p className="build-plan-done">Everything in the plan is built. Check the client's requirements below.</p>}
    </section>
  )
}

function StepBody({ def, step, highlight }: { def: MissionDef; step: BuildStep; highlight: boolean }) {
  return (
    <div className="build-step-body">
      <p>{step.intro}</p>
      <PortalPath def={def} steps={step.portalPath} highlight={highlight} />
      <dl className="build-settings">
        {step.settings.map(s => (
          <div key={s.label} className="build-setting">
            <dt>{s.label}</dt>
            <dd className="build-value">{s.value}</dd>
            <dd className="build-why">{s.why} <span className="build-rules">{s.rules.map(r => <RuleChip key={r} id={r} />)}</span></dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** A rule ID from the register, linking to its Learn page when it has one (simulator rules have none). */
function RuleChip({ id }: { id: string }) {
  const info = ruleInfo(id)
  const source = info?.sources[0]
  return source
    ? <a className="rule-chip" href={source.url} target="_blank" rel="noreferrer" title={`${info.text} (${source.title})`}>{id}</a>
    : <span className="rule-chip" title={info?.text ?? ''}>{id}</span>
}

interface Existing {
  id: string
  name: string
  location: string
  resources: number
  createdBy: string
}

/** Resource groups the player didn't create: the client's, there before the job started (PORTAL-21s). */
function alreadyThere(world: World): Existing[] {
  return Object.values(world.tenant.resourceGroups)
    .map(g => ({ g, creator: creatorOf(world.activityLog, g.id) }))
    .filter(({ creator }) => creator !== null && creator !== PLAYER_PRINCIPAL)
    .map(({ g, creator }) => ({
      id: g.id,
      name: g.name,
      location: azure.regionDisplayName(g.location),
      resources: Object.values(world.tenant.resources).filter(r => azure.parentResourceId(r.id) === null && azure.sameName(azure.parseArmId(r.id)?.resourceGroupName ?? '', g.name)).length,
      createdBy: callerLabel(creator, world),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
