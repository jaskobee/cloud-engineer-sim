import {
  createWorld, dispatch, hasRunningDeployments, invalid, step, SYSTEMS, TICK_MS,
  type CommandHandler, type MissionMessage, type MissionReport, type MissionState, type Registry, type System, type World,
} from '../engine/index.ts'
import type { CheckResult, MessageDef, MissionContext, MissionDef, ReportDef, StageDef } from './types.ts'

/**
 * The mission engine (step 9). A mission changes the world the same two ways everything else does:
 * commands (`mission/start`, `mission/submitReport`, and the NPC and scenario commands its triggers
 * dispatch) and time (`missionSystem`, which runs after every other system). Objective status is
 * derived on demand, never stored.
 */

const SCENARIO = 'scenario'

export const stageOf = (def: MissionDef, world: World): StageDef | undefined =>
  world.mission?.id === def.id ? def.stages.find(s => s.id === world.mission?.stage) : undefined

function contextOf(mission: MissionState): MissionContext {
  return {
    stageStartedAt: mission.stageStartedAt,
    firedAt: triggerId => mission.fired[`${mission.stage}/${triggerId}`],
  }
}

/** Every objective of the mission, checked against the world right now. */
export function objectiveStatus(def: MissionDef, world: World): ({ id: string } & CheckResult)[] {
  return def.objectives.map(o => ({ id: o.id, ...o.check(world) }))
}

export const allObjectivesMet = (def: MissionDef, world: World): boolean => def.objectives.every(o => o.check(world).ok)

export interface ReportVerdict {
  correct: boolean
  rootCause: boolean
  evidence: { right: number; wrong: number }
  lesson: boolean
}

/** Whether a post-incident note is right: derived from the mission data, never stored. */
export function judgeReport(def: ReportDef, report: MissionReport | undefined): ReportVerdict {
  const pick = (options: ReportDef['rootCauses'], id: string | undefined) => options.find(o => o.id === id)?.correct === true
  const chosen = def.evidence.filter(e => report?.evidence.includes(e.id))
  const right = chosen.filter(e => e.correct).length
  const wrong = chosen.length - right
  const rootCause = pick(def.rootCauses, report?.rootCause)
  const lesson = pick(def.lessons, report?.lesson)
  return { correct: !!report && rootCause && lesson && right >= def.minEvidence && wrong === 0, rootCause, evidence: { right, wrong }, lesson }
}

const message = (id: string, at: number, m: MessageDef): MissionMessage => ({ id, at, from: m.from, ...(m.subject ? { subject: m.subject } : {}), body: m.body })

// ── Commands ───────────────────────────────────────────────────────────────────────────────────

export interface SubmitReport {
  rootCause: string
  evidence: string[]
  lesson: string
}

/** The mission's own commands. Game commands, not Azure writes: no activity log entry. */
export function missionCommands(def: MissionDef): CommandHandler[] {
  const start: CommandHandler<{ missionId: string }> = {
    type: 'mission/start',
    write: () => null,
    validate: (world, { payload }) => {
      if (payload.missionId !== def.id) return invalid('mission/unknown', `Unknown mission '${payload.missionId}'.`)
      return world.mission ? invalid('mission/already-running', `Mission '${world.mission.id}' is already running.`) : null
    },
    apply: (world) => {
      const first = def.stages[0]
      if (!first) return world
      const mission: MissionState = {
        id: def.id, stage: first.id, stageStartedAt: world.clock.now, fired: {}, reportAttempts: 0,
        messages: [message('ticket', world.clock.now, def.ticket)],
      }
      return { ...world, mission, external: { ...world.external, actors: def.actors.map(a => ({ ...a })) } }
    },
  }

  const submitReport: CommandHandler<SubmitReport> = {
    type: 'mission/submitReport',
    write: () => null,
    validate: (world, { payload }) => {
      if (!stageOf(def, world)?.acceptsReport) return invalid('mission/no-report-now', 'There is no incident to report on right now.')
      const known = (options: ReportDef['rootCauses'], id: string) => options.some(o => o.id === id)
      if (!known(def.report.rootCauses, payload.rootCause)) return invalid('mission/bad-report', 'Pick one of the root causes.')
      if (!known(def.report.lessons, payload.lesson)) return invalid('mission/bad-report', 'Pick one of the lessons.')
      if (!Array.isArray(payload.evidence) || payload.evidence.length === 0 || payload.evidence.some(e => !known(def.report.evidence, e))) {
        return invalid('mission/bad-report', 'Pick the evidence that supports the root cause.')
      }
      return null
    },
    apply: (world, { payload }) => {
      const mission = world.mission
      if (!mission) return world
      const report: MissionReport = { rootCause: payload.rootCause, evidence: [...new Set(payload.evidence)], lesson: payload.lesson, at: world.clock.now }
      return { ...world, mission: { ...mission, report, reportAttempts: mission.reportAttempts + 1 } }
    },
  }
  return [start as CommandHandler, submitReport as CommandHandler]
}

// ── Time ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Runs each tick after every other system: fires the current stage's triggers (once each, in order),
 * then moves to the next stage when the stage's condition holds. A trigger whose command can't run
 * yet (null, or refused, e.g. because a resource is still deploying) tries again on the next tick.
 * Each trigger should carry at most one command, so a refusal never leaves it half done.
 */
export function missionSystem(def: MissionDef, registry: Registry): System {
  return (world, tick) => {
    if (world.mission?.id !== def.id) return world
    let w = world
    const stage = stageOf(def, w)
    if (!stage) return world

    for (const trigger of stage.triggers) {
      const mission = w.mission as MissionState
      const key = `${stage.id}/${trigger.id}`
      if (key in mission.fired) continue
      if (trigger.when && !trigger.when(w, contextOf(mission))) continue
      let next = w
      let done = true
      for (const effect of trigger.effects) {
        if (effect.kind !== 'command') continue
        const command = effect.command(next)
        const result = command ? dispatch(next, registry, command) : null
        if (!result || result.outcome.status !== 'accepted') {
          done = false
          break
        }
        next = result.world
      }
      if (!done) continue
      const messages = trigger.effects.flatMap((e, i) => (e.kind === 'message' ? [message(`${key}/${i}`, tick.end, e.message)] : []))
      const current = next.mission as MissionState
      w = { ...next, mission: { ...current, fired: { ...current.fired, [key]: tick.end }, messages: [...current.messages, ...messages] } }
    }

    const mission = w.mission as MissionState
    if (mission.completedAt === undefined && stage.completeWhen?.(w, contextOf(mission))) {
      const index = def.stages.indexOf(stage)
      const nextStage = def.stages[index + 1]
      if (nextStage) {
        w = {
          ...w,
          mission: { ...mission, stage: nextStage.id, stageStartedAt: tick.end, ...(nextStage.completeWhen ? {} : { completedAt: tick.end }) },
        }
      }
    }
    return w
  }
}

/** The default systems plus the mission's, which runs last. */
export const systemsFor = (def: MissionDef, registry: Registry): System[] => [...SYSTEMS, missionSystem(def, registry)]

/**
 * A new world for the mission: the client's subscription and the resources the client already has
 * (created through real operations by the client's people), then `mission/start`. Time runs until
 * the client's deployments are done, so the player starts in a settled world.
 */
export function startMission(def: MissionDef, seed: string, registry: Registry): World {
  const run = (w: World, type: string, caller: string, payload: unknown): World => {
    const { world, outcome } = dispatch(w, registry, { type, caller, payload })
    if (outcome.status !== 'accepted') throw new Error(`Mission setup '${type}' was refused: ${JSON.stringify(outcome.refusal)}`)
    return world
  }
  let w = createWorld({ seed, epochMs: def.startsAt })
  w = run(w, 'scenario/addSubscription', SCENARIO, def.subscription)
  for (const command of def.setup(def.subscription.subscriptionId)) {
    w = run(w, command.type, command.caller, command.payload)
    while (hasRunningDeployments(w)) w = step(w, TICK_MS)
  }
  w = run(w, 'mission/start', SCENARIO, { missionId: def.id })
  return step(w, TICK_MS, systemsFor(def, registry))
}
