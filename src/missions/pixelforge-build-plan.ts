import { azure, type Resource, type World } from '../engine/index.ts'
import { alertRulesFor, publicIpOf, vms, vmsRunning } from './checks.ts'
import { anchorStep, res, sec, svc } from './pathSteps.ts'
import { OFFICE_IP, REGION } from './pixelforge-shared.ts'
import type { BuildPlan, BuildSetting } from './types.ts'

/**
 * Guided mode's exact recipe for "PixelForge: Launch Day" (D-8, spec 2026-10-11). Every value has a reason and the
 * rules behind it. The values are suggestions: `done` reads relationships, never names (CLAUDE.md rule 10), and the
 * rule steps count rules instead of judging reachability (that's the objectives' job, through the flow evaluator).
 */

const ofType = (world: World, type: string): Resource[] => azure.resourcesOfType(world, type).sort((a, b) => a.id.localeCompare(b.id))
const inRegion = (rs: Resource[]) => rs.filter(r => r.location === REGION)
const vnets = (w: World) => inRegion(ofType(w, azure.VNET_TYPE))
const nsgs = (w: World) => inRegion(ofType(w, azure.NSG_TYPE))
const subnetsOf = (w: World, vnetId: string) => ofType(w, azure.SUBNET_TYPE).filter(s => azure.sameName(azure.parentResourceId(s.id) ?? '', vnetId))
const customInbound = (w: World, nsg: Resource) => azure.securityRulesOf(w, nsg.id).filter(r => azure.ruleProperties(r).direction === 'Inbound')
const nsgOfSubnet = (s: Resource) => (s.properties.networkSecurityGroup as { id?: string } | undefined)?.id ?? null
const associated = (w: World, nsg: Resource) => ofType(w, azure.SUBNET_TYPE).some(s => azure.sameName(nsgOfSubnet(s) ?? '', nsg.id))
const filled = (w: World) => nsgs(w).filter(n => customInbound(w, n).length >= 2)

/** Resources the plan's portal paths point at, found by relationships like the checks. */
export const BUILD_ROLES: Record<string, (world: World) => string | null> = {
  vnet: w => vnets(w)[0]?.id ?? null,
  nsgToFill: w => (nsgs(w).find(n => customInbound(w, n).length < 2) ?? nsgs(w)[0])?.id ?? null,
  nsgToAssociate: w => (nsgs(w).find(n => !associated(w, n)) ?? nsgs(w)[0])?.id ?? null,
  vmForApp: w => (vms(w).find(vm => !azure.workloadOf(w, vm.id)) ?? vms(w)[0])?.id ?? null,
}

const set = (label: string, value: string, why: string, rules: string[]): BuildSetting => ({ label, value, why, rules })
const REGION_SETTING = set('Region', 'West Europe', 'The players are in the EU. A virtual network and everything in it live in one region.', ['VNET-1', 'NIC-1'])

const vmSettings = (name: string, subnet: string, publicIp: string, publicIpWhy: string): BuildSetting[] => [
  set('Resource group', 'rg-pixelforge-prod', 'Keep production together, apart from Mia\'s test group.', ['PORTAL-6']),
  set('Virtual machine name', name, 'Says what it is and leaves room for a second one later.', ['VM-1']),
  REGION_SETTING,
  set('Image', 'Ubuntu Server 22.04 LTS', 'The only image the simulator offers; the client\'s apps run on Linux.', ['VM-12', 'VM-12s']),
  set('Size', 'Standard_B2s_v2', 'Burstable and cheap: a beta has spiky load and the budget is tight. 2 vCPUs, 8 GiB.', ['VM-13']),
  set('Authentication type', 'SSH public key', 'Keys instead of passwords for Linux admin access.', ['VM-4', 'VM-3s']),
  set('Username', 'pixelops', 'Names like admin or root aren\'t allowed.', ['VM-2']),
  set('Public inbound ports', 'None', 'The subnet\'s network security group controls what gets in, with your rules.', ['PORTAL-19', 'NSG-7']),
  set('OS disk type (Disks tab)', 'Standard SSD', 'Reliable enough for a beta, cheaper than Premium SSD.', ['VM-10', 'VM-11']),
  set('Virtual network / Subnet (Networking tab)', `vnet-pixelforge-prod / ${subnet}`, 'The subnet decides which network security group protects the VM.', ['PORTAL-20', 'NSG-7']),
  set('Public IP', publicIp, publicIpWhy, ['PORTAL-20', 'PIP-10s']),
  set('NIC network security group', 'None', 'One NSG per subnet is enough: inbound traffic must pass every NSG on the path.', ['PORTAL-20', 'NSG-7', 'NSG-12']),
]

export const BUILD_PLAN: BuildPlan = {
  stage: 'build',
  intro: 'Lena\'s ticket (under Messages) says what the client needs. This plan says how to build it: each step names what to create, where in the portal, which values to use and why. Other valid choices pass the client\'s checks too.',
  steps: [
    {
      id: 'resource-group',
      title: 'Create the production resource group',
      intro: 'A resource group holds everything for the beta. Mia\'s rg-pixelforge-test already exists: leave it alone.',
      settings: [
        set('Resource group', 'rg-pixelforge-prod', 'Name it after the client and the environment, so nobody mistakes it for the test setup.', ['NAME-1']),
        REGION_SETTING,
      ],
      portalPath: [svc('resourceGroups', 'Resource groups'), anchorStep('create:resourceGroup', 'Create', 'PORTAL-6')],
      done: w => Object.values(w.tenant.resourceGroups).some(g => g.location === REGION),
    },
    {
      id: 'vnet',
      title: 'Create the virtual network',
      intro: 'The private network the game server and the database live in.',
      settings: [
        set('Name', 'vnet-pixelforge-prod', 'Client and environment again.', ['VNET-5']),
        REGION_SETTING,
        set('IPv4 address space (IP Addresses tab)', '10.40.0.0/16', 'A private range with room for more subnets, and it doesn\'t overlap Mia\'s 10.50.0.0/16.', ['VNET-2']),
      ],
      portalPath: [svc('virtualNetworks', 'Virtual networks'), anchorStep('create:virtualNetwork', '+ Create', 'PORTAL-6'), anchorStep('tab:ipAddresses', 'IP Addresses', 'PORTAL-7')],
      done: w => vnets(w).length > 0,
    },
    {
      id: 'subnets',
      title: 'Add a subnet for each tier',
      intro: 'One subnet for the game server, one for the database, so each gets its own network security group.',
      settings: [
        set('Subnet 1', 'snet-game, 10.40.1.0/24', 'Room for 251 hosts: Azure keeps 5 addresses of every subnet.', ['SUB-2']),
        set('Subnet 2', 'snet-data, 10.40.2.0/24', 'Separate from the game subnet; subnets can\'t overlap.', ['SUB-3']),
      ],
      portalPath: [svc('virtualNetworks', 'Virtual networks'), res('vnet', 'your virtual network'), sec('subnets', 'Subnets', 'PORTAL-11'), anchorStep('vnet:addSubnet', '+ Subnet', 'PORTAL-11')],
      done: w => vnets(w).some(v => subnetsOf(w, v.id).length >= 2),
    },
    {
      id: 'nsgs',
      title: 'Create a network security group for each subnet',
      intro: 'Network security groups allow or deny traffic. Every new one already has default rules.',
      settings: [
        set('Names', 'nsg-snet-game and nsg-snet-data', 'Named after the subnet each one protects.', ['NSG-9']),
        REGION_SETTING,
      ],
      portalPath: [svc('networkSecurityGroups', 'Network security groups'), anchorStep('create:networkSecurityGroup', '+ Create', 'PORTAL-6')],
      done: w => nsgs(w).length >= 2,
    },
    {
      id: 'game-rules',
      title: 'Add the game subnet\'s inbound rules',
      intro: 'On nsg-snet-game, add two inbound security rules. Everything else stays denied by DenyAllInbound (65500).',
      settings: [
        set('Allow-HTTPS', 'Source Service Tag Internet, TCP, destination port 443, Allow, priority 200', 'Players connect over HTTPS from anywhere. A Standard public IP lets nothing in until a rule allows it.', ['PIP-1', 'NSG-11']),
        set('Allow-SSH-Office', `Source IP Addresses ${OFFICE_IP}, TCP, destination port 22, Allow, priority 210`, 'Admin SSH only from the office, never from the whole internet.', ['NSG-1', 'NSG-11']),
      ],
      portalPath: [svc('networkSecurityGroups', 'Network security groups'), res('nsgToFill', 'nsg-snet-game'), sec('inbound', 'Inbound security rules', 'PORTAL-12'), anchorStep('nsg:inbound:add', '+ Add', 'PORTAL-12')],
      done: w => filled(w).length >= 1,
    },
    {
      id: 'data-rules',
      title: 'Add the data subnet\'s inbound rules',
      intro: 'On nsg-snet-data: let the game subnet reach PostgreSQL, and nothing else in the virtual network.',
      settings: [
        set('Allow-Postgres-From-Game', 'Source IP Addresses 10.40.1.0/24, TCP, destination port 5432, Allow, priority 100', 'Only the game subnet talks to the database.', ['NSG-1', 'NSG-11']),
        set('Deny-VNet-Inbound', 'Source Service Tag VirtualNetwork, Any protocol, destination port *, Deny, priority 200', 'The default AllowVNetInBound (65000) would let the whole virtual network in. A lower number wins.', ['NSG-3', 'NSG-1', 'NSG-15']),
      ],
      portalPath: [svc('networkSecurityGroups', 'Network security groups'), res('nsgToFill', 'nsg-snet-data'), sec('inbound', 'Inbound security rules', 'PORTAL-12'), anchorStep('nsg:inbound:add', '+ Add', 'PORTAL-12')],
      done: w => filled(w).length >= 2,
    },
    {
      id: 'associate',
      title: 'Associate each NSG with its subnet',
      intro: 'An NSG does nothing until it\'s associated. On a subnet it protects every VM in that subnet, including ones added later.',
      settings: [
        set('nsg-snet-game', 'Subnets › Associate › vnet-pixelforge-prod / snet-game', 'Inbound traffic passes the subnet\'s NSG first.', ['NSG-7', 'NSG-12']),
        set('nsg-snet-data', 'Subnets › Associate › vnet-pixelforge-prod / snet-data', 'Same for the database subnet.', ['NSG-7', 'NSG-12']),
      ],
      portalPath: [svc('networkSecurityGroups', 'Network security groups'), res('nsgToAssociate', 'an NSG'), sec('subnets', 'Subnets', 'PORTAL-12'), anchorStep('nsg:associate', 'Associate', 'PORTAL-12')],
      done: w => vnets(w).some(v => {
        const subnets = subnetsOf(w, v.id)
        return subnets.length >= 2 && subnets.every(s => nsgOfSubnet(s) !== null)
      }),
    },
    {
      id: 'game-vm',
      title: 'Create the game server VM',
      intro: 'Create a virtual machine. The Networking tab creates its network interface and a public IP with it, in one deployment.',
      settings: vmSettings('vm-game-01', 'snet-game', '(new) vm-game-01-ip', 'Players on the internet reach the game API only through a public IP.'),
      portalPath: [svc('virtualMachines', 'Virtual machines'), anchorStep('create:virtualMachine', 'Create', 'PORTAL-6'), anchorStep('tab:networking', 'Networking', 'PORTAL-20'), anchorStep('wizard:review', 'Review + create', 'PORTAL-6')],
      done: w => vms(w).some(vm => publicIpOf(w, vm) !== undefined),
    },
    {
      id: 'db-vm',
      title: 'Create the database VM',
      intro: 'Same as the game server, in the data subnet, and without a public IP.',
      settings: vmSettings('vm-db-01', 'snet-data', 'None', 'The database must never be reachable from the internet. Without a public IP it can\'t be.'),
      portalPath: [svc('virtualMachines', 'Virtual machines'), anchorStep('create:virtualMachine', 'Create', 'PORTAL-6'), anchorStep('tab:networking', 'Networking', 'PORTAL-20'), anchorStep('wizard:review', 'Review + create', 'PORTAL-6')],
      done: w => vms(w).some(vm => publicIpOf(w, vm) === undefined),
    },
    {
      id: 'apps',
      title: 'Install the client\'s apps',
      intro: 'Once both VMs run, put PostgreSQL on the database VM and the game API on the game server (Simulated app on each VM\'s Overview).',
      settings: [
        set('vm-db-01', 'PostgreSQL', 'The game\'s database.', ['RUN-1s']),
        set('vm-game-01', 'Game API, database at vm-db-01\'s private IP', 'The game API connects to PostgreSQL over the virtual network on TCP 5432.', ['RUN-1s', 'RUN-2s']),
      ],
      portalPath: [svc('virtualMachines', 'Virtual machines'), res('vmForApp', 'a VM'), sec('overview', 'Overview', 'PORTAL-14')],
      done: w => vmsRunning(w, 'game-api').length > 0 && vmsRunning(w, 'postgres').length > 0,
    },
    {
      id: 'monitoring-resources',
      title: 'Create the monitoring resources',
      intro: 'Application Insights runs availability tests and keeps their results in a Log Analytics workspace.',
      settings: [
        set('Log Analytics workspace', 'log-pixelforge-prod, West Europe', 'Where the monitoring data is stored. It costs nothing until data comes in.', ['MON-5', 'MON-30']),
        set('Application Insights', 'appi-pixelforge-prod, workspace log-pixelforge-prod', 'Application Insights is workspace-based: it needs the workspace first.', ['MON-5']),
      ],
      portalPath: [svc('logAnalytics', 'Log Analytics workspaces'), anchorStep('create:workspace', 'Create', 'PORTAL-6'), svc('applicationInsights', 'Application Insights'), anchorStep('create:component', 'Create', 'PORTAL-6')],
      done: w => ofType(w, azure.WORKSPACE_TYPE).length > 0 && ofType(w, azure.COMPONENT_TYPE).length > 0,
    },
    {
      id: 'availability',
      title: 'Watch the game API from the internet',
      intro: 'A standard availability test calls the game API like a player would, and an alert rule tells you when it fails.',
      settings: [
        set('Standard test URL', 'https://<vm-game-01\'s public IP>/health', 'The test must reach the API from the public internet, like players.', ['MON-19']),
        set('Test locations', 'Five, for example the EU ones', 'At least five, so a problem in one network isn\'t mistaken for an outage.', ['MON-2']),
        set('Alert rule', 'Alert when 3 of 5 locations fail', 'The recommended threshold is the number of locations minus 2.', ['MON-23']),
      ],
      portalPath: [svc('applicationInsights', 'Application Insights'), res('component', 'your Application Insights'), sec('availability', 'Availability', 'PORTAL-17s'), anchorStep('insights:addTest', 'Add Standard test', 'PORTAL-17'), anchorStep('webtest:addAlert', 'Add alert rule', 'PORTAL-17s')],
      done: w => ofType(w, azure.WEBTEST_TYPE).some(t => azure.webTestView(t).locations.length >= 5 && alertRulesFor(w, t).length > 0),
    },
  ],
}
