import type { System } from './clock.ts'
import type { Refusal } from './commands.ts'
import type { ArmId } from './world.ts'

/** The `status` values the sim uses, a subset of MON-10. */
export type ActivityStatus = 'Started' | 'Succeeded' | 'Failed'

/**
 * One activity log event, using the Administrative event field names (MON-9).
 * `level` and `subStatus` aren't modelled yet (MON-12u).
 */
export interface ActivityLogEntry {
  eventDataId: string
  operationId: string
  correlationId: string
  category: 'Administrative'
  operationName: string
  resourceId: ArmId
  subscriptionId: string
  resourceGroupName?: string
  caller: string
  status: ActivityStatus
  /** Sim ms. */
  eventTimestamp: number
  /** Sim-only, not an Azure field: why the control plane refused the write. */
  refusal?: Refusal
}

/** Activity log events are kept 90 days (MON-7). */
export const ACTIVITY_LOG_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

/** Drops entries older than the retention period (MON-13s). The log is append-only, so it's sorted. */
export const activityLogRetention: System = world => {
  const cutoff = world.clock.now - ACTIVITY_LOG_RETENTION_MS
  const first = world.activityLog[0]
  if (first === undefined || first.eventTimestamp >= cutoff) return world
  return { ...world, activityLog: world.activityLog.filter(e => e.eventTimestamp >= cutoff) }
}

/**
 * Who created a resource or resource group: the caller of the first successful write to it in the activity log
 * (MON-9, PORTAL-21s). Null when the log has no such event (the OS disk a VM write creates, VM-15s, or events past
 * retention).
 */
export function creatorOf(log: readonly ActivityLogEntry[], id: ArmId): string | null {
  const key = id.toLowerCase()
  const first = log.find(e => e.status === 'Succeeded' && e.resourceId.toLowerCase() === key && /\/write$/i.test(e.operationName))
  return first?.caller ?? null
}
