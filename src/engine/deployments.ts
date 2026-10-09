import type { ActivityLogEntry } from './activityLog.ts'
import type { System, Tick } from './clock.ts'
import type { ArmId, Resource, World } from './world.ts'

/**
 * The deployment engine (bootstrap report §I step 6). An accepted asynchronous write doesn't finish
 * at once: its resources show an in-progress provisioning state (ARM-5, ARM-1s) until the operation
 * completes in sim time, and only then does the activity log record `Succeeded` (MON-10s).
 *
 * Each such write is a one-operation deployment (ARM-12s). Deployments are plain data in
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
}

export interface Deployment {
  id: string
  /** `<resource name>-<YYYYMMDDHHmmss>` (ARM-12s). */
  name: string
  correlationId: string
  subscriptionId: string
  resourceGroupName?: string
  caller: string
  provisioningState: DeploymentState
  /** Sim ms. */
  startedAt: number
  /** When the operation completes (sim ms). */
  endsAt: number
  /** Set when it finished: the tick boundary at which it was seen complete. */
  completedAt?: number
  operation: DeploymentOperation
  /** `eventDataId` reserved for the closing activity log event, so the system needs no RNG. */
  finishedEventDataId: string
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

function finish(world: World, deployment: Deployment, tick: Tick): World {
  const { operation } = deployment
  const resources = { ...world.tenant.resources }
  for (const id of [...operation.created, ...operation.updated]) {
    const key = id.toLowerCase()
    const current = resources[key]
    if (current && isInProgress(current.provisioningState)) resources[key] = { ...current, provisioningState: 'Succeeded' } satisfies Resource
  }
  for (const id of operation.deleted) delete resources[id.toLowerCase()]

  const succeeded: ActivityLogEntry = {
    eventDataId: deployment.finishedEventDataId,
    operationId: operation.operationId,
    correlationId: deployment.correlationId,
    category: 'Administrative',
    operationName: operation.operationName,
    resourceId: operation.targetResourceId,
    subscriptionId: deployment.subscriptionId,
    ...(deployment.resourceGroupName === undefined ? {} : { resourceGroupName: deployment.resourceGroupName }),
    caller: deployment.caller,
    status: 'Succeeded',
    eventTimestamp: tick.end,
  }
  return {
    ...world,
    tenant: { ...world.tenant, resources },
    deployments: { ...world.deployments, [deployment.id]: { ...deployment, provisioningState: 'Succeeded', completedAt: tick.end } },
    activityLog: [...world.activityLog, succeeded],
  }
}

/**
 * Completes every running deployment whose operation ends by this tick, oldest first. Completion is
 * observed at the tick boundary, so activity log timestamps stay in order.
 */
export const deploymentSystem: System = (world, tick) => {
  const due = Object.values(world.deployments)
    .filter(d => d.provisioningState === 'Running' && d.endsAt <= tick.end)
    .sort((a, b) => a.endsAt - b.endsAt || a.startedAt - b.startedAt || a.id.localeCompare(b.id))
  let w = world
  for (const d of due) w = finish(w, d, tick)
  return w
}

/** True while any deployment is running. */
export const hasRunningDeployments = (world: World): boolean =>
  Object.values(world.deployments).some(d => d.provisioningState === 'Running')
