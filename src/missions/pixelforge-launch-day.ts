import { azure, type Command, type Resource, type World } from '../engine/index.ts'
import {
  activeAlertsFor, alertRulesFor, availabilityTestsFor, exposure, formatExposure, greenFor, inboundAllowed, otherVnetAddress, publicIpOf,
  SOME_INTERNET_IP, subnetPrefixOf, vms, vmsRunning,
} from './checks.ts'
import { allObjectivesMet, judgeReport } from './engine.ts'
import type { CheckResult, Condition, MissionDef, ObjectiveDef, ReportDef } from './types.ts'

/**
 * Mission 1, "PixelForge: Launch Day" (VM edition). Design: Docs/BOOTSTRAP_REPORT.md §G. Every check
 * reads exposure and relationships through the flow evaluator, so names, address ranges, priorities
 * and NSG placement (subnet or NIC) are the player's choice.
 */

/** Made-up subscription ID for the client (like the sandbox one). */
const SUBSCRIPTION = { subscriptionId: '7b3e1d52-4c8a-4f19-9e6d-2a5c8f0b3d71', displayName: 'PixelForge Production' }
const LENA = { id: 'lena', displayName: 'Lena Vogt', role: 'CTO, PixelForge Games', principalName: 'lena@pixelforge.example' }
const MIA = { id: 'mia', displayName: 'Mia Becker', role: 'Developer, PixelForge Games', principalName: 'mia@pixelforge.example' }
const JONAS = { id: 'jonas', displayName: 'Jonas Richter', role: 'External security consultant', principalName: 'jonas@contoso-security.example' }
/** The office's address from the ticket (documentation range 203.0.113.0/24). */
export const OFFICE_IP = '203.0.113.10'
const MINUTE = 60_000
const BASELINE_MS = 10 * MINUTE
const REGION = 'westeurope'

// ── Who is who: by what runs where, never by name ──────────────────────────────────────────────

/** The VM the game API runs on (the first one, if the player installed it twice). */
const gameVm = (world: World): Resource | undefined => vmsRunning(world, 'game-api').sort((a, b) => a.id.localeCompare(b.id))[0]
const dbVm = (world: World): Resource | undefined => vmsRunning(world, 'postgres').sort((a, b) => a.id.localeCompare(b.id))[0]

const pass = (detail: string): CheckResult => ({ ok: true, detail })
const fail = (detail: string): CheckResult => ({ ok: false, detail })
const NO_GAME = fail('No VM runs the game API yet. Once your VMs run, install the apps from each VM\'s Simulated app section.')
const NO_DB = fail('No VM runs PostgreSQL yet. Install it from the database VM\'s Simulated app section.')

// ── Objectives ─────────────────────────────────────────────────────────────────────────────────

const OBJECTIVES: ObjectiveDef[] = [
  {
    id: 'players-https',
    title: 'Players reach the game API over HTTPS',
    technical: 'The game API runs on a VM with a Standard public IP, and a network security group allows TCP 443 from Internet.',
    rules: ['PIP-10s', 'NSG-7', 'RUN-2s', 'RUN-4s'],
    check: world => {
      const vm = gameVm(world)
      if (!vm) return NO_GAME
      const why = azure.refusalForNewConnection(world, vm, SOME_INTERNET_IP)
      return why ? fail(`A new player connecting to ${vm.name} would be refused: ${why}`) : pass(`New players reach the game API on ${vm.name} over HTTPS.`)
    },
    hints: [
      'Players are on the internet. Think about what has to be true for a connection from the internet to reach your game server.',
      'A Standard public IP is closed to inbound traffic until a network security group allows it.',
      'Check the NSGs on the game VM\'s subnet and network interface: inbound traffic must be allowed by both.',
      'Add an inbound security rule that allows TCP 443 from the Internet service tag.',
      'Create a security rule: Inbound, Allow, TCP, source Internet, destination port 443, priority 200, on the game subnet\'s NSG.',
    ],
  },
  {
    id: 'db-private',
    title: 'The database is never reachable from the internet',
    technical: 'The PostgreSQL VM has no public IP address.',
    rules: ['PIP-10s'],
    check: world => {
      const vm = dbVm(world)
      if (!vm) return NO_DB
      const pip = publicIpOf(world, vm)
      return pip ? fail(`${vm.name} has the public IP ${String(pip.properties.ipAddress)}. Remove it: the database must never be public.`) : pass(`${vm.name} has no public IP.`)
    },
    hints: [
      'What would let someone on the internet reach a VM at all?',
      'A VM is only reachable from the internet through a public IP address.',
      'Look at the database VM\'s network interface.',
      'The database VM\'s network interface shouldn\'t have a public IP address.',
      'Edit the database VM\'s network interface and set Public IP address to None.',
    ],
  },
  {
    id: 'db-only-game',
    title: 'Only the game server talks to the database',
    technical: 'TCP 5432 to the database is allowed from the game server and denied from the rest of the virtual network.',
    rules: ['NSG-3', 'NSG-1', 'NSG-15'],
    check: world => {
      const db = dbVm(world)
      const game = gameVm(world)
      if (!db) return NO_DB
      if (!game) return NO_GAME
      const dbNic = azure.primaryNicOf(world, db)
      const gameNic = azure.primaryNicOf(world, game)
      if (!dbNic || !gameNic) return fail('Both VMs need a network interface.')
      if (!inboundAllowed(world, db, 'Tcp', 5432, azure.privateIpOf(gameNic))) return fail(`${game.name} can't reach PostgreSQL on ${db.name} (TCP 5432).`)
      const gamePrefix = subnetPrefixOf(world, gameNic)
      const other = otherVnetAddress(world, dbNic, [gamePrefix ?? '', `${azure.privateIpOf(dbNic)}/32`])
      if (!other) return fail('The virtual network has no room outside the game subnet to test from.')
      return inboundAllowed(world, db, 'Tcp', 5432, other)
        ? fail(`Anything else in the virtual network can reach PostgreSQL too (tested from ${other}). The default rule AllowVNetInBound allows it.`)
        : pass(`TCP 5432 reaches ${db.name} from the game server only.`)
    },
    hints: [
      'Who can reach the database inside your virtual network right now?',
      'Every NSG has a default rule, AllowVNetInBound (65000), that allows all traffic from inside the virtual network.',
      'The NSG on the database\'s subnet needs rules of its own, before the defaults.',
      'Allow TCP 5432 from the game subnet, then deny everything else from VirtualNetwork with a higher priority number.',
      'On the data subnet\'s NSG: priority 100 Allow TCP 5432 from the game subnet\'s range; priority 200 Deny * from VirtualNetwork.',
    ],
  },
  {
    id: 'ssh-office',
    title: 'Admin SSH only from the office',
    technical: `TCP 22 to the game VM is allowed from ${OFFICE_IP} and from nowhere else on the internet.`,
    rules: ['NSG-1', 'NSG-11'],
    check: world => {
      const vm = gameVm(world)
      if (!vm) return NO_GAME
      if (!inboundAllowed(world, vm, 'Tcp', 22, OFFICE_IP)) return fail(`The office (${OFFICE_IP}) can't reach ${vm.name} on TCP 22.`)
      return inboundAllowed(world, vm, 'Tcp', 22, SOME_INTERNET_IP)
        ? fail(`SSH on ${vm.name} is open to the whole internet, not just the office.`)
        : pass(`SSH reaches ${vm.name} from the office only.`)
    },
    hints: [
      'The team needs admin access, but only from one place.',
      'A security rule can match a single source address instead of a service tag.',
      'Look at the inbound rules that apply to the game VM.',
      `Allow TCP 22 with source ${OFFICE_IP}, not Internet.`,
      `Create a security rule: Inbound, Allow, TCP, source ${OFFICE_IP}, destination port 22, priority 210.`,
    ],
  },
  {
    id: 'nothing-else-open',
    title: 'Nothing else is open to the internet',
    technical: 'From the internet only TCP 443 reaches the game VM (plus TCP 22 from the office), and no other VM is reachable.',
    rules: ['NSG-3', 'PIP-10s'],
    check: world => {
      const game = gameVm(world)
      if (!game) return NO_GAME
      const open = exposure(world, game, SOME_INTERNET_IP)
      if (formatExposure(open) !== 'TCP 443') return fail(`From the internet, ${game.name} is open on ${formatExposure(open)}. Only TCP 443 should be.`)
      const office = exposure(world, game, OFFICE_IP)
      if (formatExposure(office) !== 'TCP 22, TCP 443') return fail(`From the office, ${game.name} is open on ${formatExposure(office)}. Only TCP 22 and 443 should be.`)
      const other = vms(world).find(v => v.id !== game.id && exposure(world, v, SOME_INTERNET_IP).length > 0)
      return other ? fail(`${other.name} is reachable from the internet (${formatExposure(exposure(world, other, SOME_INTERNET_IP))}).`) : pass('Only HTTPS is open to players, and SSH only to the office.')
    },
    hints: [
      'The old test setup "had everything open". What is open now?',
      'DenyAllInbound (65500) blocks everything no rule allows. Every allow rule widens that.',
      'Effective security rules and IP flow verify show what reaches the game VM.',
      'Remove allow rules that open more than TCP 443 (and SSH from the office).',
      'Delete any rule that allows a port other than 443 from Internet or *, and keep SSH limited to the office address.',
    ],
  },
  {
    id: 'west-europe',
    title: 'Everything runs in West Europe',
    technical: 'Every resource you create is in West Europe (alert rules are global).',
    rules: ['REG-1', 'VNET-1', 'NIC-1'],
    check: world => {
      if (!gameVm(world)) return NO_GAME
      const client = new Set([LENA, MIA, JONAS].map(a => a.principalName))
      const elsewhere = Object.values(world.tenant.resources).find(r => !client.has(r.createdBy) && r.location !== REGION && r.location !== 'global')
      return elsewhere ? fail(`${elsewhere.name} is in ${azure.regionDisplayName(elsewhere.location)}. The players are in the EU: use West Europe.`) : pass('Everything you built is in West Europe.')
    },
    hints: [
      'Where are PixelForge\'s players?',
      'A virtual network lives in one region, and a NIC must be in the same region as its virtual network.',
      'Check the region of each resource you created.',
      'Create everything in West Europe. Mia\'s North Europe test network can\'t be used.',
      'Recreate anything outside West Europe in West Europe.',
    ],
  },
  {
    id: 'monitoring',
    title: 'We hear about outages before players do',
    technical: 'A standard availability test checks the game API over HTTPS from at least five locations, and an alert rule watches it.',
    rules: ['MON-1', 'MON-2', 'MON-5', 'MON-23'],
    check: world => {
      const game = gameVm(world)
      if (!game) return NO_GAME
      const tests = availabilityTestsFor(world, game)
      if (tests.length === 0) {
        const ip = publicIpOf(world, game)
        return fail(`No enabled availability test checks ${ip ? `https://${String(ip.properties.ipAddress)}` : 'the game API'} yet.`)
      }
      const wide = tests.filter(t => azure.webTestView(t).locations.length >= 5)
      if (wide.length === 0) return fail('Test from at least five locations, so a problem near one location doesn\'t look like an outage.')
      return wide.some(t => alertRulesFor(world, t).length > 0) ? pass('An availability test and an alert rule watch the game API.') : fail('Add an alert rule to the availability test, or nobody hears about a failure.')
    },
    hints: [
      'How would you know the game is down before a player tells you?',
      'Application Insights availability tests call your app from Azure locations around the world.',
      'You need a Log Analytics workspace, Application Insights, an availability test and an alert rule.',
      'Create a standard availability test against https://<game public IP>/health from five locations, then an alert rule on it.',
      'Workspace → Application Insights → availability test (five European locations, 5 minutes) → alert rule (3 of 5 locations, Sev 1).',
    ],
  },
]

// ── The incident: Jonas "hardens" the NSG in front of the game API ────────────────────────────

/**
 * Jonas's write: a deny-everything-from-Internet rule in the first NSG on the game API's inbound path,
 * with a lower number than the rule that allows HTTPS, so it's processed first (NSG-1). Null while
 * that isn't possible (no allowing rule yet, or no free number below it).
 */
function hardening(world: World): Command | null {
  const vm = gameVm(world)
  const nic = vm ? azure.primaryNicOf(world, vm) : undefined
  if (!vm || !nic) return null
  const verdict = azure.evaluateFlow(world, { nicId: nic.id, direction: 'Inbound', protocol: 'Tcp', localIp: azure.privateIpOf(nic), localPort: 443, remoteIp: SOME_INTERNET_IP, remotePort: 50000 })
  const first = verdict.kind === 'decided' ? verdict.stages[0] : undefined
  if (!first || first.access !== 'Allow') return null
  const rules = azure.securityRulesOf(world, first.nsgId)
  const taken = new Set(rules.map(r => azure.ruleProperties(r)).filter(p => p.direction === 'Inbound').map(p => p.priority))
  let priority = 100
  while (taken.has(priority) && priority < first.priority) priority++
  if (priority >= first.priority) return null
  let name = 'Deny-Internet-Inbound'
  for (let i = 2; rules.some(r => azure.sameName(r.name, name)); i++) name = `Deny-Internet-Inbound-${i}`
  return {
    type: 'arm/securityRules/write',
    caller: JONAS.principalName,
    payload: {
      networkSecurityGroupId: first.nsgId,
      name,
      properties: {
        priority, direction: 'Inbound', access: 'Deny', protocol: '*', sourceAddressPrefix: 'Internet', sourcePortRange: '*',
        destinationAddressPrefix: '*', destinationPortRange: '*', description: 'Hardening: block inbound internet traffic',
      },
    },
  }
}

const sinceStage = (ms: number): Condition => (world, ctx) => world.clock.now - ctx.stageStartedAt >= ms
const gameTests = (world: World) => {
  const vm = gameVm(world)
  return vm ? availabilityTestsFor(world, vm) : []
}
const green = (world: World, ms: number) => gameTests(world).some(t => greenFor(world, t, ms))
const objective = (id: string) => (world: World) => OBJECTIVES.find(o => o.id === id)?.check(world).ok === true

// ── The post-incident note ─────────────────────────────────────────────────────────────────────

const REPORT: ReportDef = {
  rootCauses: [
    { id: 'deny-priority', text: 'A new deny rule with a lower priority number was processed before the rule that allows HTTPS', correct: true },
    { id: 'vm-stopped', text: 'The game server stopped', correct: false },
    { id: 'db-unreachable', text: 'The game API lost its connection to the database', correct: false },
    { id: 'public-ip-changed', text: 'The game server\'s public IP address changed', correct: false },
    { id: 'region-outage', text: 'An outage in the West Europe region', correct: false },
  ],
  evidence: [
    { id: 'activity-log', text: 'Activity log: a security rule was written by Jonas just before the first failures', correct: true },
    { id: 'ip-flow-verify', text: 'IP flow verify: TCP 443 from the internet was denied by the new deny rule', correct: true },
    { id: 'availability-timeouts', text: 'Availability results: timeouts from every location', correct: true },
    { id: 'sessions-survived', text: 'Players already in matches kept playing: only new connections failed', correct: true },
    { id: 'cpu-maxed', text: 'Metrics: Percentage CPU was at 100 %', correct: false },
    { id: 'status-503', text: 'Availability results: the game API answered 503', correct: false },
  ],
  lessons: [
    { id: 'default-deny', text: 'The rule wasn\'t needed: DenyAllInbound (65500) already denies inbound traffic that no rule allows', correct: true },
    { id: 'stateless', text: 'NSGs are stateless, so deny rules must be repeated for return traffic', correct: false },
    { id: 'max-priority', text: 'Deny rules must always use priority 4096', correct: false },
    { id: 'nic-only', text: 'Deny rules only work on network interfaces, not subnets', correct: false },
  ],
  minEvidence: 2,
}

// ── The mission ────────────────────────────────────────────────────────────────────────────────

const ALL = OBJECTIVES.map(o => o.id)

export const PIXELFORGE_LAUNCH_DAY: MissionDef = {
  id: 'pixelforge-launch-day',
  title: 'PixelForge: Launch Day',
  client: {
    name: 'PixelForge Games', industry: 'Game development', size: 'Indie studio, 6 people',
    situation: 'Their multiplayer game Starfall Arena opens a public beta on Friday. The backend (a game API and a PostgreSQL database) runs on a developer\'s workstation.',
    goal: 'The backend running in Azure, secure and monitored, for the beta.',
    constraints: 'Small budget, players in the EU, admin access only from the office.',
  },
  // Friday 16 October 2026, 17:00 in Germany (15:00 UTC).
  startsAt: Date.UTC(2026, 9, 16, 15, 0, 0),
  subscription: SUBSCRIPTION,
  actors: [LENA, MIA, JONAS],
  ticket: {
    from: LENA.id,
    subject: 'Beta servers need to be live by Friday',
    body: [
      'Hi! Our beta opens Friday. We need our game API server and its database running in Azure, in West Europe since our players are in the EU.',
      'Players connect to the API over HTTPS. The database must never be reachable from the internet. Only the game server should talk to it.',
      `Our team needs SSH for admin work, but only from our office (${OFFICE_IP}). Our old test setup had everything open and we got scanned to death.`,
      'Mia set up a test network in North Europe last month, but ignore that. And please make sure we hear about it before players do if the game goes down.',
      'Budget is tight. Thanks!',
    ].join('\n\n'),
  },
  setup: subscriptionId => {
    const rg = 'rg-pixelforge-test'
    const vnetId = azure.resourceId(subscriptionId, rg, azure.VNET_TYPE, 'vnet-mia-test')
    return [
      { type: 'arm/resourceGroups/write', caller: MIA.principalName, payload: { subscriptionId, name: rg, location: 'northeurope' } },
      { type: 'arm/virtualNetworks/write', caller: MIA.principalName, payload: { subscriptionId, resourceGroupName: rg, name: 'vnet-mia-test', location: 'northeurope', addressPrefixes: ['10.50.0.0/16'] } },
      { type: 'arm/subnets/write', caller: MIA.principalName, payload: { virtualNetworkId: vnetId, name: 'snet-test', addressPrefix: '10.50.1.0/24' } },
    ]
  },
  objectives: OBJECTIVES,
  stages: [
    {
      id: 'build',
      title: 'Design and build',
      goal: 'Build what the ticket asks for. Objectives tick when the infrastructure matches them.',
      objectives: ALL,
      triggers: [],
      completeWhen: world => allObjectivesMet(PIXELFORGE_LAUNCH_DAY, world),
    },
    {
      id: 'go-live',
      title: 'Go live',
      goal: 'The beta is open. Watch the environment run with real players for a while.',
      objectives: ALL,
      triggers: [{
        id: 'open-beta',
        effects: [
          { kind: 'command', command: () => ({ type: 'scenario/setTraffic', caller: 'scenario', payload: { profile: 'beta-launch' } }) },
          { kind: 'message', message: { from: LENA.id, subject: 'We\'re live!', body: 'The beta is open and the first players are coming in. Thanks for getting us here!' } },
        ],
      }],
      completeWhen: (world, ctx) => sinceStage(BASELINE_MS)(world, ctx) && allObjectivesMet(PIXELFORGE_LAUNCH_DAY, world) && green(world, BASELINE_MS),
    },
    {
      id: 'incident',
      title: 'Incident',
      goal: 'Something is wrong. Find out what, and fix it.',
      objectives: [],
      triggers: [
        { id: 'hardening', effects: [{ kind: 'command', command: hardening }] },
        {
          id: 'lena-alert',
          when: (world, ctx) => world.alerts.fired.some(a => a.firedAt >= ctx.stageStartedAt),
          effects: [{ kind: 'message', message: { from: LENA.id, subject: 'Login problems?', body: 'Weird: people already in matches are fine, but nobody new can log in! Can you take a look?' } }],
        },
      ],
      completeWhen: (world, ctx) => {
        const at = ctx.firedAt('hardening')
        const vm = gameVm(world)
        return at !== undefined && world.clock.now - at >= BASELINE_MS && objective('players-https')(world) && objective('nothing-else-open')(world)
          && vm !== undefined && activeAlertsFor(world, vm).length === 0 && green(world, BASELINE_MS)
      },
    },
    {
      id: 'report',
      title: 'Post-incident note',
      goal: 'Tell Lena what broke, how you know, and what Jonas should take away from it.',
      objectives: [],
      acceptsReport: true,
      triggers: [{
        id: 'ask',
        effects: [{ kind: 'message', message: { from: LENA.id, subject: 'What happened?', body: 'New players are getting in again, thank you! Can you send me a short note: what broke, how you know, and what we tell Jonas?' } }],
      }],
      completeWhen: world => judgeReport(REPORT, world.mission?.report).correct,
    },
    {
      id: 'complete',
      title: 'Mission complete',
      goal: 'The beta backend runs in Azure, locked down and monitored.',
      objectives: [],
      triggers: [{
        id: 'sign-off',
        effects: [{ kind: 'message', message: { from: LENA.id, subject: 'Thank you!', body: 'Great write-up. Jonas agrees his rule wasn\'t needed. The beta is running, it\'s locked down, and we heard about the problem before most players did. Let\'s talk about getting network changes reviewed before they go live.' } }],
      }],
    },
  ],
  report: REPORT,
  certifications: ['AZ-900', 'AZ-104', 'AZ-700'],
}
