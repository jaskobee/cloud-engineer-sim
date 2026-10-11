import type { ActivityLogEntry } from './activityLog.ts'
import { deploymentTimestamp, isInProgress, pruneDeploymentHistory, type Deployment, type DeploymentOperation } from './deployments.ts'
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
  | { status: 'accepted'; operationId?: string; /** Set when the write runs as a deployment (ARM-12s, ARM-15s). */ deploymentId?: string }
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

/**
 * The multi-resource deployment a create page submits when it makes several resources at once (ARM-15s): a list
 * of resource writes, in dependency order. It's handled by the pipeline itself, not by a registry handler.
 */
export const DEPLOYMENT_COMMAND = 'arm/deployments/write'

export interface DeploymentWrite {
  resources: { type: string; payload: unknown }[]
}

interface PlannedWrite {
  command: Command
  handler: CommandHandler
  target: WriteTarget
  before: World
  after: World
  durationMs: number
}

type Plan =
  | { kind: 'refused'; refusal: Refusal; failed?: { command: Command; target: WriteTarget } }
  | { kind: 'control'; handler: CommandHandler }
  | { kind: 'writes'; writes: PlannedWrite[] }

function innerCommands(command: Command): Command[] | Refusal {
  if (command.type !== DEPLOYMENT_COMMAND) return [command]
  const resources = (command.payload as Partial<DeploymentWrite> | null)?.resources
  if (!Array.isArray(resources) || resources.length === 0) return invalid('engine/empty-deployment', 'A deployment needs at least one resource write.')
  return resources.map(r => ({
    type: r.type, payload: r.payload, caller: command.caller,
    ...(command.correlationId === undefined ? {} : { correlationId: command.correlationId }),
  }))
}

/**
 * Validates and applies the command's writes in order, each against the world with the earlier ones applied, so
 * a write may reference a resource created earlier in the same deployment (ARM-15s). Nothing is marked in progress
 * yet, which is also why those references pass the ARM-11u check while other deployments' resources don't.
 */
function plan(world: World, registry: Registry, command: Command): Plan {
  if (command.caller.trim() === '') return { kind: 'refused', refusal: invalid('engine/missing-caller', 'Every command needs a caller.') }
  const commands = innerCommands(command)
  if (!Array.isArray(commands)) return { kind: 'refused', refusal: commands }
  const writes: PlannedWrite[] = []
  let w = world
  for (const cmd of commands) {
    const handler = precheck(registry, cmd)
    if ('kind' in handler) return { kind: 'refused', refusal: handler }
    const target = handler.write(cmd)
    if (target === null) {
      if (command.type !== DEPLOYMENT_COMMAND) {
        const refusal = handler.validate(w, cmd)
        return refusal ? { kind: 'refused', refusal } : { kind: 'control', handler }
      }
      return { kind: 'refused', refusal: invalid('engine/not-a-write', `'${cmd.type}' can't be part of a deployment.`) }
    }
    const refusal = busyRefusal(w, cmd, target) ?? handler.validate(w, cmd)
    if (refusal) return { kind: 'refused', refusal, failed: { command: cmd, target } }
    const after = handler.apply(w, cmd)
    if (after.activityLog !== w.activityLog || after.rng !== w.rng || after.deployments !== w.deployments) {
      throw new Error(`Handler '${handler.type}' must not change the activity log, deployments or the RNG streams`)
    }
    writes.push({ command: cmd, handler, target, before: w, after, durationMs: handler.durationMs?.(cmd) ?? 0 })
    w = after
  }
  return { kind: 'writes', writes }
}

/** Review + create: what `dispatch` would refuse, without changing anything or logging (MON-11u). */
export function dryRun(world: World, registry: Registry, command: Command): Refusal | null {
  const p = plan(world, registry, command)
  return p.kind === 'refused' ? p.refusal : null
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

const targetBase = (target: WriteTarget, operationId: string, correlationId: string, caller: string, at: number) => ({
  operationId,
  correlationId,
  category: 'Administrative' as const,
  operationName: target.operationName,
  resourceId: target.resourceId,
  subscriptionId: target.subscriptionId,
  ...(target.resourceGroupName === undefined ? {} : { resourceGroupName: target.resourceGroupName }),
  caller,
  eventTimestamp: at,
})

/**
 * The only way a command changes the world: validate, then apply or refuse. Every control-plane
 * write records `Started` and then `Succeeded` or `Failed` in the activity log (MON-8, MON-10s).
 * A write with a duration, or a multi-resource deployment, runs as a deployment instead (ARM-12s, ARM-15s): its
 * resources show in-progress states and its `Succeeded` events are recorded as its operations complete
 * (deploymentSystem).
 */
export function dispatch(world: World, registry: Registry, command: Command): DispatchResult {
  const p = plan(world, registry, command)
  if (p.kind === 'control') return { world: p.handler.apply(world, command), outcome: { status: 'accepted' } }

  let ids = world.rng.ids
  const guid = (): string => {
    const [g, next] = nextGuid(ids)
    ids = next
    return g
  }
  const now = world.clock.now

  if (p.kind === 'refused') {
    if (!p.failed) return { world, outcome: { status: 'refused', refusal: p.refusal } }
    const operationId = guid()
    const correlationId = command.correlationId ?? guid()
    const base = targetBase(p.failed.target, operationId, correlationId, command.caller, now)
    const started: ActivityLogEntry = { ...base, eventDataId: guid(), status: 'Started' }
    const failed: ActivityLogEntry = { ...base, eventDataId: guid(), status: 'Failed', refusal: p.refusal }
    return {
      world: { ...world, rng: { ...world.rng, ids }, activityLog: [...world.activityLog, started, failed] },
      outcome: { status: 'refused', refusal: p.refusal, operationId },
    }
  }

  const { writes } = p
  const final = writes.at(-1)!.after
  // IDs in the same order as before multi-resource deployments, so single writes replay identically.
  let correlationId = command.correlationId
  const minted = writes.map(() => {
    const operationId = guid()
    correlationId ??= guid()
    return { operationId, startedId: guid(), finishedId: guid() }
  })
  const correlation = correlationId ?? ''
  const single = writes.length === 1 && command.type !== DEPLOYMENT_COMMAND

  if (single && writes[0]!.durationMs <= 0) {
    const [{ target }] = writes as [PlannedWrite]
    const [{ operationId, startedId, finishedId }] = minted as [(typeof minted)[number]]
    const base = targetBase(target, operationId, correlation, command.caller, now)
    const started: ActivityLogEntry = { ...base, eventDataId: startedId, status: 'Started' }
    const succeeded: ActivityLogEntry = { ...base, eventDataId: finishedId, status: 'Succeeded' }
    return {
      world: { ...final, rng: { ...final.rng, ids }, activityLog: [...final.activityLog, started, succeeded] },
      outcome: { status: 'accepted', operationId },
    }
  }

  // A deployment: one operation per write, one after another (ARM-8, ARM-15s).
  const resources = { ...final.tenant.resources }
  const createdHere = new Set<string>()
  let at = now
  const operations: DeploymentOperation[] = writes.map((write, i) => {
    const { created, updated, deleted } = diffResources(write.before, write.after)
    const ids = minted[i]!
    const op: DeploymentOperation = {
      operationId: ids.operationId, operationName: write.target.operationName, targetResourceId: write.target.resourceId,
      created: created.map(r => r.id),
      updated: updated.filter(r => !createdHere.has(r.id.toLowerCase())).map(r => r.id),
      deleted: deleted.map(r => r.id),
      startsAt: at, endsAt: at + Math.max(0, write.durationMs),
      startedEventDataId: ids.startedId, finishedEventDataId: ids.finishedId,
    }
    for (const r of created) createdHere.add(r.id.toLowerCase())
    at = op.endsAt
    return op
  })
  const mark = (id: string, provisioningState: string, fallback?: Resource) => {
    const current = resources[id.toLowerCase()] ?? fallback
    if (current) resources[id.toLowerCase()] = { ...current, provisioningState }
  }
  for (const op of operations) {
    for (const id of op.created) mark(id, 'Creating')
    for (const id of op.updated) if (!createdHere.has(id.toLowerCase())) mark(id, 'Updating')
  }
  // Deleted resources stay, as Deleting, until their operation completes (ARM-1s, ARM-5).
  for (const [i, op] of operations.entries()) {
    for (const id of op.deleted) mark(id, 'Deleting', writes[i]!.before.tenant.resources[id.toLowerCase()])
  }

  const main = writes.at(-1)!.target
  const first = operations[0]!
  const name = main.resourceId.split('/').at(-1) ?? 'deployment'
  const record: Deployment = {
    id: first.operationId,
    name: `${name}-${deploymentTimestamp(world.clock.epochMs, now)}`,
    correlationId: correlation,
    subscriptionId: main.subscriptionId,
    ...(main.resourceGroupName === undefined ? {} : { resourceGroupName: main.resourceGroupName }),
    caller: command.caller,
    provisioningState: 'Running',
    startedAt: now,
    endsAt: at,
    operations,
  }
  const started: ActivityLogEntry = { ...targetBase(writes[0]!.target, first.operationId, correlation, command.caller, now), eventDataId: first.startedEventDataId, status: 'Started' }
  return {
    world: {
      ...final,
      tenant: { ...final.tenant, resources },
      deployments: pruneDeploymentHistory({ ...final.deployments, [record.id]: record }, record.subscriptionId, record.resourceGroupName),
      rng: { ...final.rng, ids },
      activityLog: [...final.activityLog, started],
    },
    outcome: { status: 'accepted', operationId: operations.at(-1)!.operationId, deploymentId: record.id },
  }
}
