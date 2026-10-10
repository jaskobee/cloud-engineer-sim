import { describe, expect, it } from 'vitest'
import { azure, loadWorld, saveWorld, type World } from '../../src/engine/index.ts'
import { judgeReport, OFFICE_IP, SOME_INTERNET_IP } from '../../src/missions/index.ts'
import {
  act, ALTERNATIVE, begin, build, failing, INTENDED, MINUTE, MISSION, objective, refusal, run, runUntil, stage, SUB, type Design,
} from './play.ts'

const JONAS = 'jonas@contoso-security.example'
const messagesFrom = (w: World, who: string) => (w.mission?.messages ?? []).filter(m => m.from === who)
const players = (w: World, vm: string) => azure.activeSessions(azure.trafficOf(w, vm))
const CORRECT = { rootCause: 'deny-priority', evidence: ['activity-log', 'ip-flow-verify', 'availability-timeouts'], lesson: 'default-deny' }

/** The whole mission up to the moment Jonas's rule is in place and has been noticed. */
function toIncident(design: Design = INTENDED) {
  const built = build(begin(), design)
  let w = runUntil(built.world, x => stage(x) === 'incident', 20, 'the incident')
  w = runUntil(w, x => x.alerts.fired.some(a => a.monitorCondition === 'Fired'), 10, 'the availability alert')
  return { ...built, world: w }
}

describe('PixelForge: Launch Day — setup (BOOTSTRAP_REPORT §G)', () => {
  it('starts in the build stage with the ticket, the client\'s actors and Mia\'s test network in North Europe', () => {
    const w = begin()
    expect(w.mission).toMatchObject({ id: MISSION.id, stage: 'build', reportAttempts: 0 })
    expect(w.mission?.messages[0]).toMatchObject({ from: 'lena', subject: 'Beta servers need to be live by Friday' })
    expect(w.external.actors.map(a => a.id)).toEqual(['lena', 'mia', 'jonas'])
    const mia = azure.getResource(w, azure.resourceId(SUB, 'rg-pixelforge-test', azure.VNET_TYPE, 'vnet-mia-test'))
    expect(mia).toMatchObject({ location: 'northeurope', provisioningState: 'Succeeded', createdBy: 'mia@pixelforge.example' })
    expect(w.activityLog.some(e => e.caller === 'mia@pixelforge.example')).toBe(true)
    // Nothing is built yet, so every objective is open, with a reason.
    expect(failing(w).map(o => o.id)).toEqual(MISSION.objectives.map(o => o.id))
    expect(failing(w).every(o => o.detail.length > 0)).toBe(true)
  })

  it('every objective has a five-level hint ladder and cites rules', () => {
    for (const o of MISSION.objectives) {
      expect(o.hints, o.id).toHaveLength(5)
      expect(o.rules.length, o.id).toBeGreaterThan(0)
    }
  })

  it('the region trap: a West Europe NIC can\'t use Mia\'s North Europe network', () => {
    let w = act(begin(), 'arm/resourceGroups/write', { subscriptionId: SUB, name: 'rg-pixelforge-prod', location: 'westeurope' })
    const subnetId = `${azure.resourceId(SUB, 'rg-pixelforge-test', azure.VNET_TYPE, 'vnet-mia-test')}/subnets/snet-test`
    const r = refusal(w, 'arm/networkInterfaces/write', { subscriptionId: SUB, resourceGroupName: 'rg-pixelforge-prod', name: 'nic-game', location: 'westeurope', subnetId })
    expect(r.kind).toBe('rule')
    w = run(w, MINUTE)
    expect(stage(w)).toBe('build')
  })

  it('a post-incident note can\'t be sent before there is an incident', () => {
    expect(refusal(begin(), 'mission/submitReport', CORRECT)).toMatchObject({ kind: 'invalid', code: 'mission/no-report-now' })
  })
})

describe('PixelForge: Launch Day — played headless, incident included', () => {
  it('build → go live → incident → fix → report → complete', () => {
    // Build. Objectives are checked by exposure, so they tick as the world matches them.
    const built = build(begin(), INTENDED)
    let w = built.world
    expect(failing(w)).toEqual([])
    expect(stage(w)).toBe('go-live')

    // Go live: Lena opens the beta (scenario traffic), players arrive, a 10-minute green baseline.
    w = run(w, MINUTE)
    expect(w.external.traffic.profile).toBe('beta-launch')
    expect(messagesFrom(w, 'lena').map(m => m.subject)).toContain('We\'re live!')
    w = runUntil(w, x => stage(x) === 'incident', 20, 'the incident')
    const before = players(w, built.vmGame)
    expect(before).toBeGreaterThan(0)

    // The incident is a real operation by Jonas, in the activity log (CLAUDE.md rule 4).
    w = run(w, 10_000)
    const jonasWrites = w.activityLog.filter(e => e.caller === JONAS)
    expect(jonasWrites.map(e => [e.operationName, e.status])).toEqual([
      ['Microsoft.Network/networkSecurityGroups/securityRules/write', 'Started'],
      ['Microsoft.Network/networkSecurityGroups/securityRules/write', 'Succeeded'],
    ])
    const jonasRule = `${built.gameNsg}/securityRules/Deny-Internet-Inbound`
    expect(azure.ruleProperties(azure.getResource(w, jonasRule)!).priority).toBe(100)

    // Symptoms: availability fails from every location, the alert fires, Lena writes. Players already
    // in matches keep playing (NSG-4), new ones are refused.
    w = runUntil(w, x => messagesFrom(x, 'lena').some(m => m.subject === 'Login problems?'), 10, 'Lena\'s message')
    // The alert fires at 3 of 5 failing locations; a few minutes later all five have timed out.
    w = run(w, 4 * MINUTE)
    const results = azure.resultsOf(w, built.test).slice(-5)
    expect(results.every(r => !r.Success && r.Message.startsWith('Timed out'))).toBe(true)
    expect(w.alerts.fired[0]).toMatchObject({ monitorCondition: 'Fired', alertRuleName: 'alert-game-api' })
    expect(players(w, built.vmGame)).toBeGreaterThan(0)
    expect(azure.trafficOf(w, built.vmGame)?.counters.refused).toBeGreaterThan(0)

    // Diagnosis with IP flow verify: the same evaluator the mission uses.
    const nic = azure.primaryNicOf(w, azure.getResource(w, built.vmGame)!)!
    const check = azure.ipFlowVerify(w, { vmId: built.vmGame, direction: 'Inbound', protocol: 'Tcp', localIp: azure.privateIpOf(nic), localPort: 443, remoteIp: SOME_INTERNET_IP, remotePort: 50000 })
    expect(check).toMatchObject({ ok: true, access: 'Access denied', ruleName: 'Deny-Internet-Inbound', nsgName: 'nsg-game' })

    // Not fixed, not done: the mission waits.
    w = run(w, 15 * MINUTE)
    expect(stage(w)).toBe('incident')

    // Fix: delete Jonas's rule. Ten green minutes later the alert has resolved and Lena asks for a note.
    w = act(w, 'arm/securityRules/delete', { securityRuleId: jonasRule })
    w = runUntil(w, x => stage(x) === 'report', 15, 'the report stage')
    expect(w.alerts.fired[0]?.monitorCondition).toBe('Resolved')
    expect(messagesFrom(w, 'lena').map(m => m.subject)).toContain('Login problems?')
    w = run(w, 1_000)
    expect(messagesFrom(w, 'lena').at(-1)?.subject).toBe('What happened?')

    // A wrong note is recorded but doesn't finish the mission.
    w = act(w, 'mission/submitReport', { rootCause: 'vm-stopped', evidence: ['cpu-maxed'], lesson: 'stateless' })
    w = run(w, 1_000)
    expect(stage(w)).toBe('report')
    expect(w.mission?.reportAttempts).toBe(1)
    expect(judgeReport(MISSION.report, w.mission?.report)).toMatchObject({ correct: false, rootCause: false, lesson: false, evidence: { right: 0, wrong: 1 } })

    // The right one does.
    w = act(w, 'mission/submitReport', CORRECT)
    w = run(w, 2_000)
    expect(stage(w)).toBe('complete')
    expect(w.mission?.completedAt).toBeGreaterThan(0)
    expect(messagesFrom(w, 'lena').at(-1)?.subject).toBe('Thank you!')
  })

  it('another valid design passes too: NSGs on the NICs, other names, ranges and priorities (rule 10)', () => {
    const built = build(begin('alt'), ALTERNATIVE)
    expect(failing(built.world)).toEqual([])
    const { world, gameNsg } = toIncident(ALTERNATIVE)
    // Jonas hardens the NSG in front of the game API, wherever the player put it, below the HTTPS allow.
    const jonas = azure.securityRulesOf(world, gameNsg).find(r => r.createdBy === JONAS)
    expect(jonas && azure.ruleProperties(jonas).priority).toBe(100)
  })

  it('moving Jonas\'s rule after the allow rules is a valid fix as well', () => {
    const incident = toIncident()
    const { gameNsg } = incident
    let w = incident.world
    const rule = `${gameNsg}/securityRules/Deny-Internet-Inbound`
    const props = azure.ruleProperties(azure.getResource(w, rule)!)
    w = act(w, 'arm/securityRules/write', { networkSecurityGroupId: gameNsg, name: 'Deny-Internet-Inbound', properties: { ...props, priority: 4000 } })
    w = runUntil(w, x => stage(x) === 'report', 15, 'the report stage')
    expect(stage(w)).toBe('report')
  })

  it('opening everything is not a fix', () => {
    const incident = toIncident()
    const { gameNsg } = incident
    let w = incident.world
    w = act(w, 'arm/securityRules/delete', { securityRuleId: `${gameNsg}/securityRules/Deny-Internet-Inbound` })
    w = act(w, 'arm/securityRules/write', {
      networkSecurityGroupId: gameNsg, name: 'Allow-All',
      properties: { priority: 150, direction: 'Inbound', access: 'Allow', protocol: '*', sourceAddressPrefix: '*', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '*' },
    })
    w = run(w, 20 * MINUTE)
    expect(stage(w)).toBe('incident')
    expect(objective(w, 'nothing-else-open')).toMatchObject({ ok: false })
  })

  it('is deterministic: same seed, same world; save and load mid-incident changes nothing', () => {
    const a = toIncident().world
    const b = toIncident().world
    expect(saveWorld(a)).toBe(saveWorld(b))
    const loaded = loadWorld(saveWorld(a))
    if (!loaded.ok) throw new Error(loaded.message)
    expect(run(loaded.world, 3 * MINUTE)).toEqual(run(a, 3 * MINUTE))
  })
})

describe('PixelForge: Launch Day — designs the client rejects', () => {
  const variant = (changes: Partial<Design>) => build(begin(), { ...INTENDED, ...changes }).world

  it('SSH open to the internet', () => {
    const w = variant({ gameRules: [INTENDED.gameRules[0]!, { name: 'Allow-SSH', properties: { ...INTENDED.gameRules[1]!.properties, sourceAddressPrefix: 'Internet' } }] })
    expect(objective(w, 'ssh-office')).toMatchObject({ ok: false })
    expect(objective(w, 'nothing-else-open')?.detail).toContain('TCP 22, TCP 443')
    expect(stage(run(w, MINUTE))).toBe('build')
  })

  it('a public IP on the database VM', () => {
    const w = variant({ dbPublicIp: true })
    expect(objective(w, 'db-private')).toMatchObject({ ok: false })
    expect(stage(w)).toBe('build')
  })

  it('a data NSG that forgets AllowVNetInBound', () => {
    const w = variant({ dataRules: [INTENDED.dataRules[0]!] })
    expect(objective(w, 'db-only-game')?.detail).toContain('AllowVNetInBound')
    expect(stage(w)).toBe('build')
  })

  it('SSH from the office missing', () => {
    const w = variant({ gameRules: [INTENDED.gameRules[0]!] })
    expect(objective(w, 'ssh-office')?.detail).toContain(OFFICE_IP)
  })

  it('an availability test from fewer than five locations', () => {
    const w = variant({ locations: INTENDED.locations.slice(0, 3) })
    expect(objective(w, 'monitoring')?.detail).toContain('five locations')
    expect(stage(w)).toBe('build')
  })
})
