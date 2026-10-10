import { azure } from '../engine/index.ts'

/**
 * INFO topics (MVP §10, BOOTSTRAP_REPORT §G): short explanations of the concepts a mission uses. Every
 * paragraph cites the AZURE_FACTS rules it comes from, so the game never teaches more than Learn says
 * (`tests/facts.test.ts` checks the IDs). Wording is ours; the facts are Learn's.
 */

export interface InfoSection {
  heading: 'What is it?' | 'Why does it exist?' | 'How does Azure use it?' | 'What does it connect to?' | 'Common mistakes' | 'In this simulator'
  text: string
  rules: readonly string[]
}

export interface InfoTopic {
  id: string
  title: string
  sections: readonly InfoSection[]
  related: readonly string[]
  certifications: readonly string[]
}

export const INFO_TOPICS: readonly InfoTopic[] = [
  {
    id: 'resource-group',
    title: 'Resource group',
    sections: [
      { heading: 'What is it?', text: 'Holds related resources in a subscription. Its own region only says where its metadata is stored.', rules: ['RG-1'] },
      { heading: 'How does Azure use it?', text: 'Resources inside a resource group can be in different regions.', rules: ['RG-1'] },
      { heading: 'Common mistakes', text: 'Treating the resource group\'s region as the region of everything in it. Each resource has its own location.', rules: ['RG-1'] },
    ],
    related: ['region'],
    certifications: ['AZ-900', 'AZ-104'],
  },
  {
    id: 'region',
    title: 'Region',
    sections: [
      { heading: 'What is it?', text: 'Where in the world a resource runs, such as West Europe (Netherlands) or North Europe (Ireland).', rules: ['REG-1'] },
      { heading: 'How does Azure use it?', text: 'A virtual network lives in exactly one region. You can only create a resource in a virtual network in the same region and subscription, so a network interface must be in its virtual network\'s region.', rules: ['VNET-1', 'VNET-6', 'NIC-1'] },
      { heading: 'Common mistakes', text: 'Building a VM in one region and trying to use a virtual network from another. Connecting regions takes peering.', rules: ['VNET-1', 'VNET-6'] },
    ],
    related: ['virtual-network', 'network-interface'],
    certifications: ['AZ-900', 'AZ-104'],
  },
  {
    id: 'virtual-network',
    title: 'Virtual network',
    sections: [
      { heading: 'What is it?', text: 'Your private network in Azure: an address space (CIDR blocks) in one region, divided into subnets.', rules: ['VNET-1', 'VNET-7'] },
      { heading: 'Why does it exist?', text: 'VMs join it through their network interfaces. By default everything inside it may reach everything else (the AllowVNetInBound rule), and NSGs narrow that down.', rules: ['NIC-2', 'NSG-3'] },
      { heading: 'How does Azure use it?', text: 'Use private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 or 100.64.0.0/10. Some ranges can never be used, such as 127.0.0.0/8 and 168.63.129.16/32.', rules: ['VNET-2', 'VNET-3'] },
      { heading: 'Common mistakes', text: 'Choosing an address space with no room for the subnets you\'ll need: every subnet must fit inside it.', rules: ['SUB-4', 'VNET-4'] },
    ],
    related: ['subnet', 'region', 'nsg'],
    certifications: ['AZ-104', 'AZ-700'],
  },
  {
    id: 'subnet',
    title: 'Subnet',
    sections: [
      { heading: 'What is it?', text: 'A range of addresses inside a virtual network. Subnets can\'t overlap and must fit inside the virtual network\'s address space.', rules: ['SUB-3', 'SUB-4'] },
      { heading: 'How does Azure use it?', text: 'Azure reserves five addresses in every subnet: the first four and the last. In 10.40.1.0/24, .0 to .3 and .255 are reserved, so the first VM gets .4. The smallest IPv4 subnet is /29.', rules: ['SUB-2', 'SUB-1'] },
      { heading: 'What does it connect to?', text: 'At most one network security group. Its rules apply to everything in the subnet.', rules: ['NSG-12'] },
      { heading: 'Common mistakes', text: 'Forgetting the five reserved addresses, or planning to resize a subnet that already has VMs in it.', rules: ['SUB-2', 'SUB-5'] },
    ],
    related: ['virtual-network', 'nsg'],
    certifications: ['AZ-104', 'AZ-700'],
  },
  {
    id: 'nsg',
    title: 'Network security group',
    sections: [
      { heading: 'What is it?', text: 'A list of allow and deny rules for network traffic. Each rule matches source, source port, destination, destination port and protocol.', rules: ['NSG-4'] },
      { heading: 'How does Azure use it?', text: 'Rules run by priority, 100 to 4096, lowest number first. The first rule that matches decides and processing stops. Default rules (65000 and up) come last: allow traffic inside the virtual network, allow the Azure load balancer, deny everything else inbound.', rules: ['NSG-1', 'NSG-3'] },
      { heading: 'How does Azure use it?', text: 'NSGs are stateful: return traffic needs no rule, and a rule change only affects new connections. Existing connections keep flowing.', rules: ['NSG-4'] },
      { heading: 'What does it connect to?', text: 'Subnets and network interfaces. Rules can use service tags such as Internet and VirtualNetwork instead of addresses.', rules: ['NSG-12', 'NSG-5', 'NSG-15'] },
      { heading: 'Common mistakes', text: 'A deny rule with a lower number than an allow rule wins, even if the allow was there first. And the default AllowVNetInBound lets everything inside the virtual network in unless your own rules say otherwise.', rules: ['NSG-1', 'NSG-3'] },
    ],
    related: ['nsg-placement', 'ip-flow-verify', 'effective-security-rules'],
    certifications: ['AZ-104', 'AZ-700'],
  },
  {
    id: 'nsg-placement',
    title: 'NSG on a subnet or a network interface',
    sections: [
      { heading: 'What is it?', text: 'An NSG can be associated with a subnet, with a network interface, or both. Associating with subnets is the recommended way.', rules: ['NSG-12'] },
      { heading: 'How does Azure use it?', text: 'Inbound traffic meets the subnet\'s NSG first, then the network interface\'s. Outbound it\'s the other way round. When both exist, both must allow the traffic.', rules: ['NSG-7'] },
      { heading: 'How does Azure use it?', text: 'Inbound rules see the VM\'s private address: Azure translates the public IP before the NSG runs.', rules: ['NSG-14'] },
      { heading: 'Common mistakes', text: 'Allowing a port on the subnet\'s NSG while the network interface\'s NSG still blocks it.', rules: ['NSG-7'] },
    ],
    related: ['nsg', 'effective-security-rules'],
    certifications: ['AZ-104', 'AZ-700'],
  },
  {
    id: 'public-ip',
    title: 'Public IP address',
    sections: [
      { heading: 'What is it?', text: 'An address on the internet that lets internet resources reach an Azure resource, for example through a VM\'s network interface.', rules: ['PIP-10', 'PIP-8'] },
      { heading: 'How does Azure use it?', text: 'Standard public IPs are secure by default: closed to inbound traffic until an NSG allows it. Basic public IPs were retired on 30 September 2025.', rules: ['PIP-1', 'NSG-8', 'PIP-2'] },
      { heading: 'Common mistakes', text: 'Giving a public IP to a server that never needs to be reached from the internet, like a database.', rules: ['PIP-10'] },
    ],
    related: ['network-interface', 'nsg'],
    certifications: ['AZ-104', 'AZ-700'],
  },
  {
    id: 'network-interface',
    title: 'Network interface',
    sections: [
      { heading: 'What is it?', text: 'What connects a VM to a subnet. Every network interface on a VM is connected to a virtual network.', rules: ['NIC-2'] },
      { heading: 'How does Azure use it?', text: 'It holds the private IP (dynamic by default in the portal) and optionally a public IP. It must be in the same region and subscription as its VM and its virtual network.', rules: ['NIC-4', 'PIP-8', 'NIC-1'] },
      { heading: 'What does it connect to?', text: 'A subnet, optionally a public IP and an NSG, and a VM.', rules: ['NIC-2', 'NSG-12'] },
    ],
    related: ['virtual-machine', 'subnet', 'public-ip'],
    certifications: ['AZ-104'],
  },
  {
    id: 'virtual-machine',
    title: 'Virtual machine',
    sections: [
      { heading: 'What is it?', text: 'A server you run in Azure: a size (CPU and memory), an image (here Ubuntu) and an OS disk, connected through a network interface.', rules: ['VM-9', 'NIC-2'] },
      { heading: 'How does Azure use it?', text: 'Power state and provisioning state are separate. Running is the normal state; a stopped VM is still billed for compute, a deallocated one isn\'t.', rules: ['VM-7', 'VM-8'] },
      { heading: 'How does Azure use it?', text: 'The portal\'s Linux VM quickstart uses an SSH public key for sign-in. Some admin names, like admin or root, aren\'t allowed.', rules: ['VM-4', 'VM-2'] },
      { heading: 'In this simulator', text: 'Apps on the VM (the game API, PostgreSQL) are simulated services with a health state, not a real operating system.', rules: ['RUN-1s'] },
    ],
    related: ['network-interface', 'nsg'],
    certifications: ['AZ-900', 'AZ-104'],
  },
  {
    id: 'log-analytics',
    title: 'Log Analytics workspace',
    sections: [
      { heading: 'What is it?', text: 'Where Application Insights sends its telemetry. Ingestion and retention are billed and set in the workspace.', rules: ['MON-5'] },
      { heading: 'How does Azure use it?', text: 'Tables keep data 30 days by default; Application Insights tables keep 90 days at no charge.', rules: ['MON-16'] },
    ],
    related: ['application-insights'],
    certifications: ['AZ-104'],
  },
  {
    id: 'application-insights',
    title: 'Application Insights',
    sections: [
      { heading: 'What is it?', text: 'Application monitoring in Azure Monitor. It sends its telemetry to a Log Analytics workspace; classic resources without one are retired.', rules: ['MON-5'] },
      { heading: 'What does it connect to?', text: 'A Log Analytics workspace for its data, and availability tests linked to it.', rules: ['MON-5', 'MON-17'] },
    ],
    related: ['log-analytics', 'availability-test'],
    certifications: ['AZ-104'],
  },
  {
    id: 'availability-test',
    title: 'Availability test',
    sections: [
      { heading: 'What is it?', text: 'A standard test sends a request to your URL from Azure locations around the world and checks the answer and how long it took.', rules: ['MON-1'] },
      { heading: 'How does Azure use it?', text: 'Use at least five locations (up to 16). With the default 5-minute frequency and five locations, your site is tested about once a minute. The URL must be reachable from the internet.', rules: ['MON-2', 'MON-19'] },
      { heading: 'How does Azure use it?', text: 'A test fails when the status code isn\'t the expected one or no answer arrives within the timeout. Results show the location, success, duration and a message.', rules: ['MON-19', 'MON-21'] },
      { heading: 'Common mistakes', text: 'Testing from one location: a problem near that location then looks like an outage.', rules: ['MON-2'] },
    ],
    related: ['alerts', 'application-insights'],
    certifications: ['AZ-104'],
  },
  {
    id: 'alerts',
    title: 'Alerts',
    sections: [
      { heading: 'What is it?', text: 'An alert rule watches a signal and fires an alert when its condition is met. For availability tests the condition is "this many locations failed".', rules: ['MON-22', 'MON-23'] },
      { heading: 'How does Azure use it?', text: 'Recommended: alert when the number of locations minus 2 fail, with at least five locations. Availability alerts are state based: one alert when the site goes down, no new one while it stays down.', rules: ['MON-23'] },
      { heading: 'How does Azure use it?', text: 'The system sets the condition: fired, then resolved once the condition isn\'t met for three consecutive checks.', rules: ['MON-24'] },
      { heading: 'In this simulator', text: 'The portal turns an alert on with every new availability test. Here you create the alert rule yourself.', rules: ['MON-4', 'MON-28s'] },
    ],
    related: ['availability-test', 'activity-log'],
    certifications: ['AZ-104'],
  },
  {
    id: 'activity-log',
    title: 'Activity log',
    sections: [
      { heading: 'What is it?', text: 'The record of control-plane operations in a subscription: every create, update and delete, who did it and when. Events are kept 90 days.', rules: ['MON-7', 'MON-9'] },
      { heading: 'How does Azure use it?', text: 'Each write records a Started event and then Succeeded or Failed, with the caller and the operation name.', rules: ['MON-8', 'MON-9'] },
      { heading: 'Common mistakes', text: 'Not checking it first when something breaks: a change made just before the problem started is often the cause.', rules: ['MON-7'] },
    ],
    related: ['alerts', 'ip-flow-verify'],
    certifications: ['AZ-104'],
  },
  {
    id: 'ip-flow-verify',
    title: 'IP flow verify',
    sections: [
      { heading: 'What is it?', text: 'A Network Watcher tool: give it a direction, protocol, local and remote address and port, and it says Access allowed or Access denied, with the rule and NSG that decided.', rules: ['NW-1'] },
      { heading: 'How does Azure use it?', text: 'It tests TCP and UDP only, and it evaluates the NSGs on both the subnet and the network interface.', rules: ['NW-2'] },
      { heading: 'In this simulator', text: 'The canvas, the availability tests and the mission checks all ask the same evaluator as IP flow verify, so they always agree.', rules: ['NW-6s'] },
    ],
    related: ['effective-security-rules', 'nsg'],
    certifications: ['AZ-104', 'AZ-700'],
  },
  {
    id: 'effective-security-rules',
    title: 'Effective security rules',
    sections: [
      { heading: 'What is it?', text: 'All the rules that apply to a network interface: its own NSG\'s and its subnet\'s, shown per NSG.', rules: ['NW-4'] },
      { heading: 'How does Azure use it?', text: 'They\'re only shown while the VM is running and an NSG is associated with its network interface or subnet.', rules: ['VM-5'] },
    ],
    related: ['ip-flow-verify', 'nsg-placement'],
    certifications: ['AZ-104', 'AZ-700'],
  },
]

export const infoTopic = (id: string): InfoTopic | undefined => INFO_TOPICS.find(t => t.id === id)

/** The INFO topic for a resource type, for the inspector's "About" link. */
const BY_TYPE: Record<string, string> = {
  [azure.VNET_TYPE.toLowerCase()]: 'virtual-network',
  [azure.SUBNET_TYPE.toLowerCase()]: 'subnet',
  [azure.NSG_TYPE.toLowerCase()]: 'nsg',
  [azure.SECURITY_RULE_TYPE.toLowerCase()]: 'nsg',
  [azure.PUBLIC_IP_TYPE.toLowerCase()]: 'public-ip',
  [azure.NIC_TYPE.toLowerCase()]: 'network-interface',
  [azure.VM_TYPE.toLowerCase()]: 'virtual-machine',
  [azure.WORKSPACE_TYPE.toLowerCase()]: 'log-analytics',
  [azure.COMPONENT_TYPE.toLowerCase()]: 'application-insights',
  [azure.WEBTEST_TYPE.toLowerCase()]: 'availability-test',
  [azure.METRIC_ALERT_TYPE.toLowerCase()]: 'alerts',
}

export const infoTopicForType = (type: string): string | undefined => BY_TYPE[type.toLowerCase()]
