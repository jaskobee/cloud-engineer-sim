import type { ActivityLogEntry } from './activityLog.ts'
import { nextGuid } from './ids.ts'
import type { ArmId, World } from './world.ts'

/**
 * Why a command was refused.
 * - `rule`: an Azure rule refused it. `ruleId` is a VERIFIED or SIM rule in Docs/AZURE_FACTS.md.
 * - `not-modelled`: the case depends on an UNCERTAIN rule or is outside the model. Never guessed.
 * - `invalid`: the command itself is malformed (engine level, not Azure behaviour).
 */
export type Refusal =
  | { kind: 'rule'; ruleId: string; message: string }
  | { kind: 'not-modelled'; ruleId: string; message: string }
  | { kind: 'invalid'; code: string; message: string }

/** A request to change the world, from the player or an NPC. */
export interface Command<P = unknown> {
  type: string
  /** Who issued it. Shown as `caller` / "Event initiated by" in the activity log (MON-9). */
  caller: string
  payload: P
  /** Groups the operations of one larger action (e.g. a deployment). A new one is minted if absent. */
  correlationId?: string
}

/** What the activity log records for a control-plane write. */
export interface WriteTarget {
  operationName: string
  resourceId: ArmId
  subscriptionId: string
  resourceGroupName?: string
}

/**
 * Implements one command type. Handlers are pure. They never touch the activity log: the pipeline
 * records every write itself, so a handler can't forget to.
 */
export interface CommandHandler<P = unknown> {
  readonly type: string
  /** The write this command performs, or null when it isn't a control-plane write (sim controls). */
  write(command: Command<P>): WriteTarget | null
  /** Null when allowed. Used both by `dispatch` and by `dryRun` (Review + create). */
  validate(world: World, command: Command<P>): Refusal | null
  /** Only called after `validate` returned null. */
  apply(world: World, command: Command<P>): World
}

export type Registry = ReadonlyMap<string, CommandHandler>

export type Outcome =
  | { status: 'accepted'; operationId?: string }
  | { status: 'refused'; refusal: Refusal; operationId?: string }

export interface DispatchResult {
  world: World
  outcome: Outcome
}

export function invalid(code: string, message: string): Refusal {
  return { kind: 'invalid', code, message }
}

/** Checks every command passes before its handler sees it. */
function precheck(registry: Registry, command: Command): CommandHandler | Refusal {
  const handler = registry.get(command.type)
  if (!handler) return invalid('engine/unknown-command', `Unknown command type '${command.type}'.`)
  if (command.caller.trim() === '') return invalid('engine/missing-caller', 'Every command needs a caller.')
  return handler
}

/** Review + create: what `dispatch` would refuse, without changing anything or logging (MON-11u). */
export function dryRun(world: World, registry: Registry, command: Command): Refusal | null {
  const handler = precheck(registry, command)
  if ('kind' in handler) return handler
  return handler.validate(world, command)
}

/**
 * The only way a command changes the world: validate, then apply or refuse. Every control-plane
 * write records `Started` and then `Succeeded` or `Failed` in the activity log (MON-8, MON-10s).
 */
export function dispatch(world: World, registry: Registry, command: Command): DispatchResult {
  const handler = precheck(registry, command)
  if ('kind' in handler) return { world, outcome: { status: 'refused', refusal: handler } }

  const refusal = handler.validate(world, command)
  const target = handler.write(command)

  if (target === null) {
    return refusal
      ? { world, outcome: { status: 'refused', refusal } }
      : { world: handler.apply(world, command), outcome: { status: 'accepted' } }
  }

  let ids = world.rng.ids
  const guid = (): string => {
    const [g, next] = nextGuid(ids)
    ids = next
    return g
  }
  const operationId = guid()
  const correlationId = command.correlationId ?? guid()
  const startedId = guid()
  const finishedId = guid()

  const base = {
    operationId,
    correlationId,
    category: 'Administrative' as const,
    operationName: target.operationName,
    resourceId: target.resourceId,
    subscriptionId: target.subscriptionId,
    ...(target.resourceGroupName === undefined ? {} : { resourceGroupName: target.resourceGroupName }),
    caller: command.caller,
    eventTimestamp: world.clock.now,
  }
  const started: ActivityLogEntry = { ...base, eventDataId: startedId, status: 'Started' }

  if (refusal) {
    const failed: ActivityLogEntry = { ...base, eventDataId: finishedId, status: 'Failed', refusal }
    return {
      world: { ...world, rng: { ...world.rng, ids }, activityLog: [...world.activityLog, started, failed] },
      outcome: { status: 'refused', refusal, operationId },
    }
  }

  const applied = handler.apply(world, command)
  if (applied.activityLog !== world.activityLog || applied.rng !== world.rng) {
    throw new Error(`Handler '${handler.type}' must not change the activity log or the RNG streams`)
  }
  const succeeded: ActivityLogEntry = { ...base, eventDataId: finishedId, status: 'Succeeded' }
  return {
    world: { ...applied, rng: { ...applied.rng, ids }, activityLog: [...applied.activityLog, started, succeeded] },
    outcome: { status: 'accepted', operationId },
  }
}
