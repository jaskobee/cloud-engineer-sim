import type { ActivityLogEntry } from './activityLog.ts'
import { deploymentTimestamp, isInProgress, pruneDeploymentHistory, type Deployment } from './deployments.ts'
import { nextGuid } from './ids.ts'
import type { ArmId, Resource, World } from './world.ts'

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
  /**
   * Sim ms the write takes to provision (ARM-13s). Absent or 0: the write completes at once (e.g.
   * resource groups, ARM-6). Otherwise it runs as a deployment (ARM-12s).
   */
  durationMs?(command: Command<P>): number
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

/** Every ARM ID mentioned anywhere in a payload (references and parents). */
function referencedIds(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value.toLowerCase().startsWith('/subscriptions/')) out.push(value)
  } else if (Array.isArray(value)) {
    for (const v of value) referencedIds(v, out)
  } else if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value)) referencedIds(v, out)
  }
  return out
}

/**
 * A write to a resource whose operation hasn't finished, or one that references such a resource, is
 * refused as not modelled: Learn doesn't document what Resource Manager does then (ARM-11u).
 * Resources are keyed by their lower-cased ID (ARM-2s).
 */
function busyRefusal(world: World, command: Command, target: WriteTarget | null): Refusal | null {
  if (target === null) return null
  const ids = [target.resourceId, ...referencedIds(command.payload)]
  for (const id of ids) {
    const resource: Resource | undefined = world.tenant.resources[id.toLowerCase()]
    if (resource && isInProgress(resource.provisioningState)) {
      return {
        kind: 'not-modelled',
        ruleId: 'ARM-11u',
        message: `'${resource.name}' is still ${resource.provisioningState.toLowerCase()}. Wait until its deployment finishes (Deployments tab), then try again.`,
      }
    }
  }
  return null
}

/** Review + create: what `dispatch` would refuse, without changing anything or logging (MON-11u). */
export function dryRun(world: World, registry: Registry, command: Command): Refusal | null {
  const handler = precheck(registry, command)
  if ('kind' in handler) return handler
  return busyRefusal(world, command, handler.write(command)) ?? handler.validate(world, command)
}

/** Which resources an apply created, changed or removed (compared by key and identity). */
function diffResources(before: World, after: World) {
  const created: Resource[] = []
  const updated: Resource[] = []
  const deleted: Resource[] = []
  const was = before.tenant.resources
  const now = after.tenant.resources
  for (const [key, r] of Object.entries(now)) {
    if (!(key in was)) created.push(r)
    else if (was[key] !== r) updated.push(r)
  }
  for (const [key, r] of Object.entries(was)) if (!(key in now)) deleted.push(r)
  return { created, updated, deleted }
}

/**
 * Turns an applied write into a running deployment (ARM-12s): the affected resources take their
 * in-progress state (ARM-1s, ARM-5) and deleted ones stay, as Deleting, until the operation completes.
 */
function startDeployment(before: World, after: World, deployment: Omit<Deployment, 'operation'> & { operationId: string; operationName: string; targetResourceId: ArmId }): World {
  const { created, updated, deleted } = diffResources(before, after)
  const resources = { ...after.tenant.resources }
  const mark = (r: Resource, provisioningState: string) => { resources[r.id.toLowerCase()] = { ...r, provisioningState } }
  for (const r of created) mark(r, 'Creating')
  for (const r of updated) mark(r, 'Updating')
  for (const r of deleted) mark(r, 'Deleting')

  const { operationId, operationName, targetResourceId, ...rest } = deployment
  const record: Deployment = {
    ...rest,
    operation: {
      operationId, operationName, targetResourceId,
      created: created.map(r => r.id), updated: updated.map(r => r.id), deleted: deleted.map(r => r.id),
    },
  }
  return {
    ...after,
    tenant: { ...after.tenant, resources },
    deployments: pruneDeploymentHistory({ ...after.deployments, [record.id]: record }, record.subscriptionId, record.resourceGroupName),
  }
}

/**
 * The only way a command changes the world: validate, then apply or refuse. Every control-plane
 * write records `Started` and then `Succeeded` or `Failed` in the activity log (MON-8, MON-10s).
 * A write with a duration starts a deployment instead; its `Succeeded` event is recorded when the
 * deployment completes (deploymentSystem).
 */
export function dispatch(world: World, registry: Registry, command: Command): DispatchResult {
  const handler = precheck(registry, command)
  if ('kind' in handler) return { world, outcome: { status: 'refused', refusal: handler } }

  const target = handler.write(command)
  const refusal = busyRefusal(world, command, target) ?? handler.validate(world, command)

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
  if (applied.activityLog !== world.activityLog || applied.rng !== world.rng || applied.deployments !== world.deployments) {
    throw new Error(`Handler '${handler.type}' must not change the activity log, deployments or the RNG streams`)
  }

  const durationMs = handler.durationMs?.(command) ?? 0
  if (durationMs > 0) {
    const name = target.resourceId.split('/').at(-1) ?? 'deployment'
    const deployed = startDeployment(world, applied, {
      id: operationId,
      name: `${name}-${deploymentTimestamp(world.clock.epochMs, world.clock.now)}`,
      correlationId,
      subscriptionId: target.subscriptionId,
      ...(target.resourceGroupName === undefined ? {} : { resourceGroupName: target.resourceGroupName }),
      caller: command.caller,
      provisioningState: 'Running',
      startedAt: world.clock.now,
      endsAt: world.clock.now + durationMs,
      finishedEventDataId: finishedId,
      operationId,
      operationName: target.operationName,
      targetResourceId: target.resourceId,
    })
    return {
      world: { ...deployed, rng: { ...deployed.rng, ids }, activityLog: [...deployed.activityLog, started] },
      outcome: { status: 'accepted', operationId },
    }
  }

  const succeeded: ActivityLogEntry = { ...base, eventDataId: finishedId, status: 'Succeeded' }
  return {
    world: { ...applied, rng: { ...applied.rng, ids }, activityLog: [...applied.activityLog, started, succeeded] },
    outcome: { status: 'accepted', operationId },
  }
}
