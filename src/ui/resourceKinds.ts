import { azure } from '../engine/index.ts'

/** What the player can create, in the order a network is usually built. */
export interface ResourceKind {
  kind: string
  label: string
  /** One plain sentence, taken from the cited rule. */
  blurb: string
  /** The AZURE_FACTS rule the blurb comes from. */
  rule: string
}

export const RESOURCE_KINDS: readonly ResourceKind[] = [
  { kind: 'resourceGroup', label: 'Resource group', blurb: 'Holds related resources. Its region is where its metadata is stored.', rule: 'RG-1' },
  { kind: 'virtualNetwork', label: 'Virtual network', blurb: 'A private network in one Azure region.', rule: 'VNET-1' },
  { kind: 'subnet', label: 'Subnet', blurb: 'An address range inside a virtual network. Azure reserves five addresses in each.', rule: 'SUB-2' },
  { kind: 'networkSecurityGroup', label: 'Network security group', blurb: 'Rules that allow or deny traffic for a subnet or a network interface.', rule: 'NSG-12' },
  { kind: 'securityRule', label: 'Security rule', blurb: 'One allow or deny rule. Lower priority numbers are processed first.', rule: 'NSG-1' },
  { kind: 'publicIp', label: 'Public IP address', blurb: 'A public address. Standard is closed to inbound traffic until an NSG allows it.', rule: 'PIP-1' },
  { kind: 'networkInterface', label: 'Network interface', blurb: 'Connects a virtual machine to a subnet.', rule: 'NIC-2' },
  { kind: 'virtualMachine', label: 'Virtual machine', blurb: 'A Linux server. It is billed while running and stops costing compute when deallocated.', rule: 'VM-7' },
  { kind: 'workspace', label: 'Log Analytics workspace', blurb: 'Where Application Insights keeps its telemetry and how long.', rule: 'MON-5' },
  { kind: 'component', label: 'Application Insights', blurb: 'Monitors an app. Classic resources are retired, so it needs a Log Analytics workspace.', rule: 'MON-5' },
  { kind: 'webTest', label: 'Availability test', blurb: 'Sends a request to a public URL from several locations and checks the answer.', rule: 'MON-1' },
  { kind: 'metricAlert', label: 'Availability alert rule', blurb: 'Fires when the test fails from enough locations, and resolves when it recovers.', rule: 'MON-23' },
]

const TYPE_LABELS: Record<string, string> = {
  [azure.VNET_TYPE.toLowerCase()]: 'Virtual network',
  [azure.SUBNET_TYPE.toLowerCase()]: 'Subnet',
  [azure.NSG_TYPE.toLowerCase()]: 'Network security group',
  [azure.SECURITY_RULE_TYPE.toLowerCase()]: 'Security rule',
  [azure.PUBLIC_IP_TYPE.toLowerCase()]: 'Public IP address',
  [azure.NIC_TYPE.toLowerCase()]: 'Network interface',
  [azure.VM_TYPE.toLowerCase()]: 'Virtual machine',
  [azure.DISK_TYPE.toLowerCase()]: 'Disk',
  [azure.WORKSPACE_TYPE.toLowerCase()]: 'Log Analytics workspace',
  [azure.COMPONENT_TYPE.toLowerCase()]: 'Application Insights',
  [azure.WEBTEST_TYPE.toLowerCase()]: 'Availability test',
  [azure.METRIC_ALERT_TYPE.toLowerCase()]: 'Alert rule',
}

export const typeLabel = (type: string): string => TYPE_LABELS[type.toLowerCase()] ?? type

export const kindLabel = (kind: string): string => RESOURCE_KINDS.find(k => k.kind === kind)?.label ?? kind
