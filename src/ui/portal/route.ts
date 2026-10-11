import { azure, type ArmId, type World } from '../../engine/index.ts'
import { kindLabel } from '../resourceKinds.ts'

/**
 * Where the player is in the portal shell (spec §5). Pure data: the store keeps the current route and a back
 * stack, and the breadcrumb is derived from it, never stored.
 */
export type ServiceId = 'monitor' | 'networkWatcher'

export type Route =
  | { page: 'home' }
  /** "All services" (PORTAL-2): every service the simulator has. */
  | { page: 'allServices' }
  /** A service list: an ARM type (lower case), or `resourceGroups`. */
  | { page: 'browse'; type: string }
  /** A resource group or resource, at one section of its service menu. */
  | { page: 'resource'; id: ArmId; section: string }
  | { page: 'service'; service: ServiceId; section: string }
  /** "Create a resource": the list of what can be created. */
  | { page: 'createPicker' }
  | { page: 'create'; kind: string; tab: string; preset?: Record<string, string> }
  | { page: 'deployment'; id: string }

/** A create or edit form for a child resource, or a watched flow: shown in a side pane over the page. */
export type ContextPane =
  | { kind: 'create'; request: { kind: string | null; preset?: Record<string, string> } }
  | { kind: 'flow'; flowId: string }

export interface Nav {
  route: Route
  back: Route[]
  /** The Map toggle in the header: the working pane shows the architecture map instead of the route. */
  map: boolean
  contextPane: ContextPane | null
  ticketOpen: boolean
  /** Sim time up to which notifications count as read. */
  notificationsSeenAt: number
}

export const HOME: Route = { page: 'home' }

export const initialNav = (): Nav => ({ route: HOME, back: [], map: false, contextPane: null, ticketOpen: true, notificationsSeenAt: 0 })

export const sameRoute = (a: Route, b: Route): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Kinds whose forms open in a side pane on their parent's page; the rest get a full-page wizard. */
export const CHILD_KINDS: readonly string[] = ['subnet', 'securityRule', 'webTest', 'metricAlert', 'associateSubnet']

/** The service list each resource type belongs to (lower-case ARM type → list label). */
const BROWSE_LABELS: Record<string, string> = {
  resourceGroups: 'Resource groups',
  [azure.VM_TYPE.toLowerCase()]: 'Virtual machines',
  [azure.VNET_TYPE.toLowerCase()]: 'Virtual networks',
  [azure.NSG_TYPE.toLowerCase()]: 'Network security groups',
  [azure.PUBLIC_IP_TYPE.toLowerCase()]: 'Public IP addresses',
  [azure.NIC_TYPE.toLowerCase()]: 'Network interfaces',
  [azure.WORKSPACE_TYPE.toLowerCase()]: 'Log Analytics workspaces',
  [azure.COMPONENT_TYPE.toLowerCase()]: 'Application Insights',
}

const BROWSE_BY_KEY = new Map(Object.entries(BROWSE_LABELS).map(([k, v]) => [k.toLowerCase(), v]))

export const browseLabel = (type: string): string => BROWSE_BY_KEY.get(type.toLowerCase()) ?? type

/** True when the type has a service list of its own (PORTAL-5). */
export const hasBrowseList = (type: string): boolean => BROWSE_BY_KEY.has(type.toLowerCase())

const SERVICE_LABELS: Record<ServiceId, string> = { monitor: 'Monitor', networkWatcher: 'Network Watcher' }
export const serviceLabel = (service: ServiceId): string => SERVICE_LABELS[service]

/** Where a resource is shown: child resources (subnets, security rules) live on their parent's page. */
export function routeForResource(id: ArmId, world: World): Route {
  const parsed = azure.parseArmId(id)
  const type = parsed?.type?.toLowerCase() ?? null
  const parent = azure.parentResourceId(id)
  if (parent && type === azure.SUBNET_TYPE.toLowerCase()) return { page: 'resource', id: parent, section: 'subnets' }
  if (parent && type === azure.SECURITY_RULE_TYPE.toLowerCase()) {
    const rule = world.tenant.resources[azure.armKey(id)]
    const outbound = String(rule?.properties.direction ?? '').toLowerCase() === 'outbound'
    return { page: 'resource', id: parent, section: outbound ? 'outbound' : 'inbound' }
  }
  return { page: 'resource', id, section: 'overview' }
}

/** "Create virtual network"; product names keep their capitals ("Create Log Analytics workspace"). */
export function createTitle(kind: string): string {
  const label = kindLabel(kind)
  return `Create ${/^(Application Insights|Log Analytics)/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1)}`
}

export interface Crumb {
  label: string
  /** Null for the current page (not a link). */
  route: Route | null
}

/** The breadcrumb for a route: Home, the list or service it belongs to, then the page itself. */
export function breadcrumbFor(route: Route, world: Pick<World, 'deployments'>): Crumb[] {
  const home: Crumb = { label: 'Home', route: HOME }
  switch (route.page) {
    case 'home':
      return [{ label: 'Home', route: null }]
    case 'allServices':
      return [home, { label: 'All services', route: null }]
    case 'browse':
      return [home, { label: browseLabel(route.type), route: null }]
    case 'service':
      return [home, { label: serviceLabel(route.service), route: null }]
    case 'createPicker':
      return [home, { label: 'Create a resource', route: null }]
    case 'create':
      return [home, { label: 'Create a resource', route: { page: 'createPicker' } }, { label: createTitle(route.kind), route: null }]
    case 'deployment': {
      const deployment = world.deployments[route.id]
      return [home, { label: deployment?.name ?? 'Deployment', route: null }]
    }
    case 'resource': {
      const parsed = azure.parseArmId(route.id)
      const name = parsed ? (parsed.names.at(-1) ?? parsed.resourceGroupName) : route.id
      const listType = parsed?.type ? parsed.type.toLowerCase() : 'resourceGroups'
      const groups: Crumb = { label: browseLabel('resourceGroups'), route: { page: 'browse', type: 'resourceGroups' } }
      if (hasBrowseList(listType)) return [home, { label: browseLabel(listType), route: { page: 'browse', type: listType } }, { label: name, route: null }]
      // No service list of its own (disks, availability tests, alert rules): reach it through its resource group.
      const groupId = parsed ? azure.resourceGroupId(parsed.subscriptionId, parsed.resourceGroupName) : null
      const group: Crumb = { label: parsed?.resourceGroupName ?? '', route: groupId ? { page: 'resource', id: groupId, section: 'overview' } : null }
      return [home, groups, group, { label: name, route: null }]
    }
  }
}
