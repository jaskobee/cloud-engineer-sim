import { azure, type World } from '../../engine/index.ts'
import { typeLabel } from '../resourceKinds.ts'
import { routeForResource, type Route } from './route.ts'

/** Icon names, drawn by `ServiceIcon` (Fluent icons), so this catalogue stays plain data. */
export type ServiceIconName = 'resourceGroup' | 'vm' | 'vnet' | 'nsg' | 'pip' | 'nic' | 'workspace' | 'insights' | 'monitor' | 'networkWatcher'

export interface ServiceDef {
  id: string
  /** The service name as the portal search finds it (PORTAL-5). */
  label: string
  route: Route
  icon: ServiceIconName
  rule: string
  /** One plain sentence for All services. */
  blurb: string
}

const browse = (type: string): Route => ({ page: 'browse', type: type.toLowerCase() })

/** The services the simulator has, in the order Home and All services show them. */
export const SERVICES: readonly ServiceDef[] = [
  { id: 'resourceGroups', label: 'Resource groups', route: { page: 'browse', type: 'resourceGroups' }, icon: 'resourceGroup', rule: 'PORTAL-5', blurb: 'Containers that hold related resources.' },
  { id: 'virtualMachines', label: 'Virtual machines', route: browse(azure.VM_TYPE), icon: 'vm', rule: 'PORTAL-5', blurb: 'Linux servers in a virtual network.' },
  { id: 'virtualNetworks', label: 'Virtual networks', route: browse(azure.VNET_TYPE), icon: 'vnet', rule: 'PORTAL-5', blurb: 'Private networks and their subnets.' },
  { id: 'networkSecurityGroups', label: 'Network security groups', route: browse(azure.NSG_TYPE), icon: 'nsg', rule: 'PORTAL-5', blurb: 'Allow and deny rules for subnets and network interfaces.' },
  { id: 'publicIpAddresses', label: 'Public IP addresses', route: browse(azure.PUBLIC_IP_TYPE), icon: 'pip', rule: 'PORTAL-5', blurb: 'Addresses reachable from the internet.' },
  { id: 'networkInterfaces', label: 'Network interfaces', route: browse(azure.NIC_TYPE), icon: 'nic', rule: 'PORTAL-5', blurb: 'Connect virtual machines to subnets.' },
  { id: 'logAnalytics', label: 'Log Analytics workspaces', route: browse(azure.WORKSPACE_TYPE), icon: 'workspace', rule: 'PORTAL-5', blurb: 'Where monitoring data is stored.' },
  { id: 'applicationInsights', label: 'Application Insights', route: browse(azure.COMPONENT_TYPE), icon: 'insights', rule: 'PORTAL-5', blurb: 'Application monitoring, including availability tests.' },
  { id: 'monitor', label: 'Monitor', route: { page: 'service', service: 'monitor', section: 'activityLog' }, icon: 'monitor', rule: 'PORTAL-5', blurb: 'Activity log and alerts across the subscription.' },
  { id: 'networkWatcher', label: 'Network Watcher', route: { page: 'service', service: 'networkWatcher', section: 'topology' }, icon: 'networkWatcher', rule: 'PORTAL-5', blurb: 'Topology and network diagnostic tools.' },
]

export interface SearchHit {
  kind: 'service' | 'resource'
  label: string
  /** Service blurb, or the resource's type and resource group. */
  detail: string
  route: Route
}

/** Global search (PORTAL-1): services by name, then resource groups and resources by name. */
export function searchPortal(query: string, world: World, limit = 8): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const services: SearchHit[] = SERVICES.filter(s => s.label.toLowerCase().includes(q)).map(s => ({ kind: 'service', label: s.label, detail: 'Service', route: s.route }))
  const groups: SearchHit[] = Object.values(world.tenant.resourceGroups)
    .filter(g => g.name.toLowerCase().includes(q))
    .map(g => ({ kind: 'resource', label: g.name, detail: 'Resource group', route: { page: 'resource', id: g.id, section: 'overview' } }))
  const resources: SearchHit[] = Object.values(world.tenant.resources)
    .filter(r => azure.parentResourceId(r.id) === null && r.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(r => ({ kind: 'resource', label: r.name, detail: `${typeLabel(r.type)} · ${azure.parseArmId(r.id)?.resourceGroupName ?? ''}`, route: routeForResource(r.id, world) }))
  return [...services, ...groups, ...resources].slice(0, limit)
}
