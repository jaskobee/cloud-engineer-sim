import { azure } from '../../engine/index.ts'
import type { ServiceId } from './route.ts'

/**
 * Service menus as data (spec §5, §6). Every label cites the PORTAL rule that backs it; a label with no rule
 * isn't shown. Items without a group sit at the top, as Learn lists them without naming a group.
 */
export interface MenuItem {
  /** Section id, used in routes (`{ page: 'resource', section }`). */
  id: string
  label: string
  rule: string
}

export interface MenuGroup {
  label: string | null
  rule: string | null
  items: MenuItem[]
}

const item = (id: string, label: string, rule: string): MenuItem => ({ id, label, rule })
const top = (...items: MenuItem[]): MenuGroup => ({ label: null, rule: null, items })
const group = (label: string, rule: string, ...items: MenuItem[]): MenuGroup => ({ label, rule, items })

const OVERVIEW = item('overview', 'Overview', 'PORTAL-4')
const ACTIVITY_LOG = item('activityLog', 'Activity log', 'PORTAL-10')

const MENUS: Record<string, MenuGroup[]> = {
  resourcegroup: [top(OVERVIEW, ACTIVITY_LOG, item('deployments', 'Deployments', 'PORTAL-9'))],
  [azure.VNET_TYPE.toLowerCase()]: [
    top(OVERVIEW, ACTIVITY_LOG),
    group('Settings', 'PORTAL-11', item('addressSpace', 'Address space', 'PORTAL-11'), item('subnets', 'Subnets', 'PORTAL-11s')),
    group('Monitoring', 'PORTAL-11', item('diagram', 'Diagram', 'PORTAL-11')),
  ],
  [azure.NSG_TYPE.toLowerCase()]: [
    top(OVERVIEW, ACTIVITY_LOG),
    group('Settings', 'PORTAL-12',
      item('inbound', 'Inbound security rules', 'PORTAL-12'),
      item('outbound', 'Outbound security rules', 'PORTAL-12'),
      item('networkInterfaces', 'Network interfaces', 'PORTAL-12'),
      item('subnets', 'Subnets', 'PORTAL-12')),
    group('Help', 'PORTAL-12', item('effectiveRules', 'Effective security rules', 'PORTAL-12')),
  ],
  [azure.NIC_TYPE.toLowerCase()]: [
    top(OVERVIEW, ACTIVITY_LOG, item('ipConfigurations', 'IP configurations', 'PORTAL-13'), item('networkSecurityGroup', 'Network security group', 'PORTAL-13')),
    group('Help', 'PORTAL-13', item('effectiveRules', 'Effective security rules', 'PORTAL-13')),
  ],
  [azure.VM_TYPE.toLowerCase()]: [
    top(OVERVIEW, ACTIVITY_LOG, item('networking', 'Networking', 'PORTAL-14')),
    group('Monitoring', 'PORTAL-14', item('alerts', 'Alerts', 'PORTAL-14'), item('metrics', 'Metrics', 'PORTAL-14')),
  ],
  [azure.COMPONENT_TYPE.toLowerCase()]: [
    top(OVERVIEW, ACTIVITY_LOG, item('availability', 'Availability', 'PORTAL-17s')),
    group('Monitoring', 'PORTAL-15', item('alerts', 'Alerts', 'PORTAL-15')),
  ],
}

/** Resource types (lower case, plus `resourcegroup`) with a menu of their own; others get the generic one. */
export const MENU_TYPES: readonly string[] = Object.keys(MENUS)

const GENERIC: MenuGroup[] = [top(OVERVIEW, ACTIVITY_LOG)]

/** The service menu of a resource type, or `resourcegroup` for a resource group. */
export function serviceMenuFor(type: string): MenuGroup[] {
  return MENUS[type.toLowerCase()] ?? GENERIC
}

const SERVICE_MENUS: Record<ServiceId, MenuGroup[]> = {
  monitor: [top(item('activityLog', 'Activity log', 'PORTAL-10'), item('alerts', 'Alerts', 'PORTAL-15'))],
  networkWatcher: [
    group('Monitoring', 'PORTAL-16', item('topology', 'Topology', 'PORTAL-16')),
    group('Network diagnostic tools', 'PORTAL-16', item('ipFlowVerify', 'IP flow verify', 'PORTAL-16'), item('effectiveRules', 'Effective security rules', 'PORTAL-16')),
  ],
}

export function serviceMenuForService(service: ServiceId): MenuGroup[] {
  return SERVICE_MENUS[service]
}

/** A section's label in a menu (for page titles: `name | Section`). */
export function sectionLabel(groups: MenuGroup[], section: string): string | null {
  for (const g of groups) for (const i of g.items) if (i.id === section) return i.label
  return null
}

/** The first section of a menu: where a service opens. */
export const firstSection = (groups: MenuGroup[]): string => groups[0]?.items[0]?.id ?? 'overview'
