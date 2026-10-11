import type { ActivityLogEntry } from './activityLog.ts'
import type { System, Tick } from './clock.ts'
import type { ArmId, Resource, World } from './world.ts'

/**
 * The deployment engine (bootstrap report §I step 6). An accepted asynchronous write doesn't finish
 * at once: its resources show an in-progress provisioning state (ARM-5, ARM-1s) until the operation
 * completes in sim time, and only then does the activity log record `Succeeded` (MON-10s).
 *
 * A single write is a one-operation deployment (ARM-12s); a create page that makes several resources is one
 * deployment with an operation per resource (ARM-15s). Deployments are plain data in
 * `world.deployments`, so they save, load and replay like everything else.
 */

/** The deployment `provisioningState` values the sim uses, a subset of ARM-9. */
export type DeploymentState = 'Running' | 'Succeeded' | 'Failed'

/** The in-progress resource states the sim uses (ARM-1s). */
export const IN_PROGRESS_STATES = ['Creating', 'Updating', 'Deleting'] as const
export type InProgressState = (typeof IN_PROGRESS_STATES)[number]

export const isInProgress = (state: string): state is InProgressState => (IN_PROGRESS_STATES as readonly string[]).includes(state)

/** Deployment history kept per resource group (ARM-10). */
export const DEPLOYMENT_HISTORY_LIMIT = 800

export interface DeploymentOperation {
  /** Same `operationId` as the write's activity log events. */
  operationId: string
  operationName: string
  targetResourceId: ArmId
  /** Resources this operation creates, updates or deletes (a VM also creates its OS disk, VM-15s). */
  created: ArmId[]
  updated: ArmId[]
  deleted: ArmId[]
  /** Sim ms. Operations of one deployment run one after another, in dependency order (ARM-8, ARM-15s). */
  startsAt: number
  endsAt: number
  /** `eventDataId`s reserved for the operation's activity log events, so the system needs no RNG. */
  startedEventDataId: string
  finishedEventDataId: string
  /** The tick boundary at which it was seen complete. */
  completedAt?: number
}

export interface Deployment {
  id: string
  /** `<resource name>-<YYYYMMDDHHmmss>` (ARM-12s): the last operation's resource. */
  name: string
  correlationId: string
  subscriptionId: string
  resourceGroupName?: string
  caller: string
  provisioningState: DeploymentState
  /** Sim ms. */
  startedAt: number
  /** When the last operation completes (sim ms). */
  endsAt: number
  /** Set when it finished: the tick boundary at which it was seen complete. */
  completedAt?: number
  /** One per resource write (ARM-10: "a deployment can include multiple operations"); one for a single write (ARM-12s). */
  operations: DeploymentOperation[]
}

/** The operation whose resource the deployment is about: the last one (the VM, after its NIC and public IP). */
export const mainOperation = (d: Deployment): DeploymentOperation => {
  const op = d.operations.at(-1)
  if (!op) throw new Error(`Deployment ${d.id} has no operations`)
  return op
}

/** Sim ms → `YYYYMMDDHHmmss` in UTC. Pure arithmetic on the sim epoch, no wall clock. */
export function deploymentTimestamp(epochMs: number, now: number): string {
  const total = Math.floor((epochMs + now) / 1000)
  const secs = ((total % 86400) + 86400) % 86400
  const days = Math.floor(total / 86400)
  // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
  const z = days + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1
  const month = mp < 10 ? mp + 3 : mp - 9
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(year, 4)}${pad(month)}${pad(day)}${pad(Math.floor(secs / 3600))}${pad(Math.floor((secs % 3600) / 60))}${pad(secs % 60)}`
}

/** Keeps the newest DEPLOYMENT_HISTORY_LIMIT deployments of one resource group (ARM-10). Running ones always stay. */
export function pruneDeploymentHistory(deployments: Record<string, Deployment>, subscriptionId: string, resourceGroupName: string | undefined): Record<string, Deployment> {
  const scope = (d: Deployment) =>
    d.subscriptionId === subscriptionId && (d.resourceGroupName ?? '').toLowerCase() === (resourceGroupName ?? '').toLowerCase()
  const inScope = Object.values(deployments).filter(scope)
  if (inScope.length <= DEPLOYMENT_HISTORY_LIMIT) return deployments
  const removable = inScope
    .filter(d => d.provisioningState !== 'Running')
    .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
  const drop = new Set(removable.slice(0, inScope.length - DEPLOYMENT_HISTORY_LIMIT).map(d => d.id))
  return Object.fromEntries(Object.entries(deployments).filter(([id]) => !drop.has(id)))
}

const logEntry = (d: Deployment, op: DeploymentOperation, status: 'Started' | 'Succeeded', eventDataId: string, at: number): ActivityLogEntry => ({
  eventDataId,
  operationId: op.operationId,
  correlationId: d.correlationId,
  category: 'Administrative',
  operationName: op.operationName,
  resourceId: op.targetResourceId,
  subscriptionId: d.subscriptionId,
  ...(d.resourceGroupName === undefined ? {} : { resourceGroupName: d.resourceGroupName }),
  caller: d.caller,
  status,
  eventTimestamp: at,
})

/**
 * Completes the deployment's due operations in order: their resources become Succeeded (or go, for deletes) and
 * `Succeeded` is logged; the next operation's `Started` is logged as it begins (ARM-15s). The deployment succeeds
 * with its last operation.
 */
function progress(world: World, deployment: Deployment, tick: Tick): World {
  const resources = { ...world.tenant.resources }
  const log: ActivityLogEntry[] = []
  const operations = deployment.operations.map(op => ({ ...op }))
  for (const [i, op] of operations.entries()) {
    if (op.completedAt !== undefined) continue
    if (op.endsAt > tick.end) break
    for (const id of [...op.created, ...op.updated]) {
      const key = id.toLowerCase()
      const current = resources[key]
      if (current && isInProgress(current.provisioningState)) resources[key] = { ...current, provisioningState: 'Succeeded' } satisfies Resource
    }
    for (const id of op.deleted) delete resources[id.toLowerCase()]
    op.completedAt = tick.end
    log.push(logEntry(deployment, op, 'Succeeded', op.finishedEventDataId, tick.end))
    const next = operations[i + 1]
    if (next) log.push(logEntry(deployment, next, 'Started', next.startedEventDataId, tick.end))
  }
  const done = operations.every(op => op.completedAt !== undefined)
  const updated: Deployment = done
    ? { ...deployment, operations, provisioningState: 'Succeeded', completedAt: tick.end }
    : { ...deployment, operations }
  return {
    ...world,
    tenant: { ...world.tenant, resources },
    deployments: { ...world.deployments, [deployment.id]: updated },
    activityLog: [...world.activityLog, ...log],
  }
}

/** When the deployment's next operation is due (sim ms). */
const nextDue = (d: Deployment): number => d.operations.find(op => op.completedAt === undefined)?.endsAt ?? d.endsAt

/**
 * Advances every running deployment whose next operation ends by this tick, oldest first. Completion is
 * observed at the tick boundary, so activity log timestamps stay in order.
 */
export const deploymentSystem: System = (world, tick) => {
  const due = Object.values(world.deployments)
    .filter(d => d.provisioningState === 'Running' && nextDue(d) <= tick.end)
    .sort((a, b) => nextDue(a) - nextDue(b) || a.startedAt - b.startedAt || a.id.localeCompare(b.id))
  let w = world
  for (const d of due) w = progress(w, d, tick)
  return w
}

/** True while any deployment is running. */
export const hasRunningDeployments = (world: World): boolean =>
  Object.values(world.deployments).some(d => d.provisioningState === 'Running')
