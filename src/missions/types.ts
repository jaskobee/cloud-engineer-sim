import type { Actor, Command, World } from '../engine/index.ts'

/**
 * Mission data (CLAUDE.md rule 10, MVP §28). A mission is a stage machine over the world: each stage
 * has triggers (effects that run once when their condition holds) and a condition that moves the
 * mission on. Conditions and objective checks only read the world, and they read it by exposure and
 * relationships (flow evaluator, references), never by resource names.
 */

/** What conditions and effects see besides the world. */
export interface MissionContext {
  /** When the current stage started (sim ms). */
  stageStartedAt: number
  /** When a trigger of the current stage fired, if it has. */
  firedAt(triggerId: string): number | undefined
}

export type Condition = (world: World, ctx: MissionContext) => boolean

/** One objective check: passes or not, with a sentence that says why. */
export interface CheckResult {
  ok: boolean
  detail: string
}

export interface ObjectiveDef {
  id: string
  /** The client's words (Standard and Expert modes). */
  title: string
  /** The technical requirement (Guided mode). */
  technical: string
  check: (world: World) => CheckResult
  /** Direction → concept → resource → action → exact step (MVP §30). */
  hints: readonly string[]
  /** AZURE_FACTS rules the objective teaches. */
  rules: readonly string[]
}

export interface MessageDef {
  from: string
  subject?: string
  body: string
}

/**
 * Something the mission does to the world. A command goes through `dispatch` like any player or NPC
 * write (rule 2); null means "not possible yet", and the trigger tries again next tick.
 */
export type Effect =
  | { kind: 'command'; command: (world: World) => Command | null }
  | { kind: 'message'; message: MessageDef }

export interface TriggerDef {
  id: string
  /** Omitted: fires as soon as the stage starts. */
  when?: Condition
  effects: readonly Effect[]
}

export interface StageDef {
  id: string
  title: string
  /** What the player is working towards in this stage. */
  goal: string
  /** Objectives shown in this stage. */
  objectives: readonly string[]
  triggers: readonly TriggerDef[]
  /** Moves the mission to the next stage. Omitted on the last stage. */
  completeWhen?: Condition
  /** The player can send the post-incident note in this stage. */
  acceptsReport?: boolean
}

export interface ReportOption {
  id: string
  text: string
  correct: boolean
}

/** The post-incident note: one root cause, supporting evidence, one lesson. */
export interface ReportDef {
  rootCauses: readonly ReportOption[]
  evidence: readonly ReportOption[]
  lessons: readonly ReportOption[]
  /** Correct evidence the note needs at least. */
  minEvidence: number
}

export interface MissionDef {
  id: string
  title: string
  client: { name: string; industry: string; size: string; situation: string; goal: string; constraints: string }
  /** Sim epoch: when the mission's world starts. */
  startsAt: number
  subscription: { subscriptionId: string; displayName: string }
  actors: readonly Actor[]
  ticket: MessageDef
  /** Client-provided resources, created through real operations before the player starts. */
  setup: (subscriptionId: string) => readonly Command[]
  objectives: readonly ObjectiveDef[]
  stages: readonly StageDef[]
  report: ReportDef
  certifications: readonly string[]
}
