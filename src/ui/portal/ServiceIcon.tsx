import {
  ChartMultiple20Regular,
  Cube20Regular,
  DataUsage20Regular,
  Desktop20Regular,
  Folder20Regular,
  Globe20Regular,
  NetworkCheck20Regular,
  Organization20Regular,
  Pulse20Regular,
  PlugConnected20Regular,
  Shield20Regular,
} from '@fluentui/react-icons'
import { azure } from '../../engine/index.ts'
import type { ServiceIconName } from './services.ts'

/**
 * Generic Fluent icons for services and resource types. They stand in for Microsoft's Azure architecture icons
 * (D-5) until those are added to public/azure-icons/.
 */
const ICONS: Record<ServiceIconName, typeof Cube20Regular> = {
  resourceGroup: Folder20Regular,
  vm: Desktop20Regular,
  vnet: Organization20Regular,
  nsg: Shield20Regular,
  pip: Globe20Regular,
  nic: PlugConnected20Regular,
  workspace: DataUsage20Regular,
  insights: ChartMultiple20Regular,
  monitor: Pulse20Regular,
  networkWatcher: NetworkCheck20Regular,
}

const BY_TYPE: Record<string, ServiceIconName> = {
  resourcegroup: 'resourceGroup',
  [azure.VM_TYPE.toLowerCase()]: 'vm',
  [azure.VNET_TYPE.toLowerCase()]: 'vnet',
  [azure.NSG_TYPE.toLowerCase()]: 'nsg',
  [azure.PUBLIC_IP_TYPE.toLowerCase()]: 'pip',
  [azure.NIC_TYPE.toLowerCase()]: 'nic',
  [azure.WORKSPACE_TYPE.toLowerCase()]: 'workspace',
  [azure.COMPONENT_TYPE.toLowerCase()]: 'insights',
  [azure.WEBTEST_TYPE.toLowerCase()]: 'insights',
  [azure.METRIC_ALERT_TYPE.toLowerCase()]: 'monitor',
}

export function ServiceIcon({ name, className }: { name: ServiceIconName; className?: string }) {
  const Icon = ICONS[name]
  return <Icon className={className ?? ''} aria-hidden="true" />
}

/** The icon for an ARM type (or `resourcegroup`); a generic cube for anything else. */
export function TypeIcon({ type, className }: { type: string; className?: string }) {
  const name = BY_TYPE[type.toLowerCase()]
  if (!name) return <Cube20Regular className={className ?? ''} aria-hidden="true" />
  return <ServiceIcon name={name} {...(className ? { className } : {})} />
}
