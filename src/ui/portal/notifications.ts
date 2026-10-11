import { azure, type World } from '../../engine/index.ts'
import { PLAYER_PRINCIPAL } from '../../store/gameStore.ts'
import type { Route } from './route.ts'

/**
 * The bell's notifications (PORTAL-8), derived from the world every time: the player's deployments and
 * resource group writes, fired and resolved alerts, and the client's ticket messages. Only "read up to" is
 * stored (in the session), never the notifications themselves.
 */
export interface Notification {
  id: string
  /** Sim ms. */
  at: number
  kind: 'deployment' | 'alert' | 'message'
  title: string
  detail: string
  status: 'info' | 'success' | 'error' | 'warning'
  route: Route | null
  /** The link's text, e.g. "Go to resource". */
  action: string | null
}

const resourceRoute = (id: string): Route => ({ page: 'resource', id, section: 'overview' })

export function notificationsOf(world: World): Notification[] {
  const out: Notification[] = []

  for (const d of Object.values(world.deployments)) {
    if (d.caller !== PLAYER_PRINCIPAL) continue
    const target = d.operation.targetResourceId
    const name = azure.parseArmId(target)?.names.at(-1) ?? d.name
    if (d.provisioningState === 'Running') {
      out.push({ id: `dep:${d.id}`, at: d.startedAt, kind: 'deployment', title: 'Deployment in progress', detail: `Deployment ${d.name} is in progress.`, status: 'info', route: { page: 'deployment', id: d.id }, action: null })
    } else if (d.provisioningState === 'Succeeded') {
      out.push({ id: `dep:${d.id}`, at: d.completedAt ?? d.endsAt, kind: 'deployment', title: 'Deployment succeeded', detail: `Deployment ${d.name} succeeded. ${name} is ready.`, status: 'success', route: resourceRoute(target), action: 'Go to resource' })
    } else {
      out.push({ id: `dep:${d.id}`, at: d.completedAt ?? d.endsAt, kind: 'deployment', title: 'Deployment failed', detail: `Deployment ${d.name} failed.`, status: 'error', route: { page: 'deployment', id: d.id }, action: null })
    }
  }

  // Resource group writes are synchronous (ARM-6): no deployment, but the portal still notifies.
  for (const e of world.activityLog) {
    if (e.caller !== PLAYER_PRINCIPAL || e.status !== 'Succeeded' || !/resourceGroups\/write$/i.test(e.operationName)) continue
    if (azure.parseArmId(e.resourceId)?.type !== null) continue
    out.push({ id: `rg:${e.eventDataId}`, at: e.eventTimestamp, kind: 'deployment', title: 'Resource group created', detail: `${azure.parseArmId(e.resourceId)?.resourceGroupName ?? ''} was created.`, status: 'success', route: resourceRoute(e.resourceId), action: 'Go to resource group' })
  }

  for (const a of world.alerts.fired) {
    out.push({ id: `alert:${a.id}:fired`, at: a.firedAt, kind: 'alert', title: `Alert fired: ${a.alertRuleName}`, detail: `Sev ${a.severity}. ${a.failedLocations.length} test location${a.failedLocations.length === 1 ? '' : 's'} failed.`, status: 'error', route: { page: 'service', service: 'monitor', section: 'alerts' }, action: 'Open alerts' })
    if (a.monitorCondition === 'Resolved' && a.resolvedAt !== undefined) {
      out.push({ id: `alert:${a.id}:resolved`, at: a.resolvedAt, kind: 'alert', title: `Alert resolved: ${a.alertRuleName}`, detail: 'The condition is no longer met.', status: 'success', route: { page: 'service', service: 'monitor', section: 'alerts' }, action: 'Open alerts' })
    }
  }

  for (const m of world.mission?.messages ?? []) {
    const actor = world.external.actors.find(a => a.id === m.from)
    const from = actor ? `${actor.displayName}, ${actor.role}` : m.from
    out.push({ id: `msg:${m.id}`, at: m.at, kind: 'message', title: m.subject ?? 'New message on your ticket', detail: `From ${from} (ticket message, not an Azure notification)`, status: 'info', route: null, action: null })
  }

  return out.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
}

export const unreadCount = (world: World, seenAt: number): number => notificationsOf(world).filter(n => n.at > seenAt).length
