import { describe, expect, it } from 'vitest'
import { azure, dispatch, loadWorld, saveWorld, step, type World } from '../../../src/engine/index.ts'
import {
  DB_IP, JONAS, NIC_GAME, NSG_DATA, NSG_GAME, ok, pixelForge, pixelForgeWithApps, registry, RG, securityRule, SNET_GAME, SUB, VM_DB, VM_GAME,
} from './fixtures.ts'

const MIN = azure.MINUTE_MS
/** Advance to the next whole sim minute, then `n` more. */
const minutes = (w: World, n: number) => step(w, Math.ceil(w.clock.now / MIN) * MIN - w.clock.now + n * MIN)
const service = (w: World, vm: string) => w.runtime[vm.toLowerCase()]?.service
const sessions = (w: World) => azure.activeSessions(azure.trafficOf(w, VM_GAME))
/** Switch players on exactly at the next whole sim minute, so arrival counts are exact. */
const playersOn = (w: World) => ok(minutes(w, 0), 'scenario/setTraffic', { profile: 'beta-launch' })

describe('simulated apps (RUN-1s)', () => {
  it('are scenario commands: validated, but no activity log entry', () => {
    const w = pixelForge()
    const after = ok(w, 'scenario/setWorkload', { vmId: VM_DB, workload: { kind: 'postgres', port: 5432 } })
    expect(after.activityLog).toBe(w.activityLog)
    expect(azure.workloadOf(after, VM_DB)).toEqual({ kind: 'postgres', port: 5432 })
    const bad = dispatch(w, registry, { type: 'scenario/setWorkload', caller: 'scenario', payload: { vmId: VM_GAME, workload: { kind: 'game-api', port: 443, database: { ip: 'nope', port: 5432 } } } })
    expect(bad.outcome).toMatchObject({ status: 'refused', refusal: { kind: 'invalid' } })
  })

  it('removing an app clears its service state', () => {
    let w = step(pixelForgeWithApps(), 1_000)
    expect(service(w, VM_DB)?.status).toBe('up')
    w = ok(w, 'scenario/setWorkload', { vmId: VM_DB, workload: null })
    expect(service(w, VM_DB)).toBeUndefined()
  })
})

describe('app health follows the infrastructure (RUN-2s)', () => {
  it('the game API is up when the flow evaluator lets it reach PostgreSQL at both ends', () => {
    const w = step(pixelForgeWithApps(), 1_000)
    expect(service(w, VM_DB)).toMatchObject({ status: 'up' })
    expect(service(w, VM_GAME)).toMatchObject({ status: 'up' })
    expect(w.runtime[VM_GAME.toLowerCase()]?.health).toBe('healthy')
  })

  it('is degraded, naming the rule, when the database NSG blocks the game subnet', () => {
    let w = securityRule(pixelForgeWithApps(), NSG_DATA, 'Deny-Postgres', { priority: 150, access: 'Deny', sourceAddressPrefix: '10.40.1.0/24', destinationPortRange: '5432' })
    w = step(w, 1_000)
    expect(service(w, VM_GAME)?.status).toBe('degraded')
    expect(service(w, VM_GAME)?.reason).toContain(`PostgreSQL at ${DB_IP}:5432: denied by Deny-Postgres in nsg-snet-data (inbound at vm-db-01)`)
    expect(w.runtime[VM_GAME.toLowerCase()]?.health).toBe('degraded')
  })

  it('is degraded when the database VM runs no PostgreSQL', () => {
    let w = ok(pixelForgeWithApps(), 'scenario/setWorkload', { vmId: VM_DB, workload: null })
    w = step(w, 1_000)
    expect(service(w, VM_GAME)?.reason).toContain("vm-db-01 doesn't run PostgreSQL")
  })

  it('keeps the runtime object when nothing changes, so health views do not re-render every tick', () => {
    const w = step(pixelForgeWithApps(), 1_000)
    expect(step(w, 5_000).runtime).toBe(w.runtime)
  })
})

describe('player traffic (RUN-3s, RUN-4s)', () => {
  it('is off until a profile is switched on', () => {
    const w = minutes(pixelForgeWithApps(), 2)
    expect(sessions(w)).toBe(0)
  })

  it('accepts 120 new players a minute through the public IP and Allow-HTTPS', () => {
    const w = minutes(playersOn(pixelForgeWithApps()), 3)
    expect(sessions(w)).toBe(360)
    expect(azure.trafficOf(w, VM_GAME)?.counters.refused).toBe(0)
  })

  it('refuses everyone when the NIC has no public IP (PIP-10s)', () => {
    let w = ok(pixelForgeWithApps(), 'arm/networkInterfaces/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'nic-game-01', location: 'westeurope', subnetId: SNET_GAME })
    w = step(playersOn(w), 30_000)
    expect(sessions(w)).toBe(0)
    expect(azure.trafficOf(w, VM_GAME)?.counters.refusedReason).toContain('no public IP address')
  })

  it('refuses new players while the game API is degraded', () => {
    let w = securityRule(pixelForgeWithApps(), NSG_DATA, 'Deny-Postgres', { priority: 150, access: 'Deny', sourceAddressPrefix: '10.40.1.0/24', destinationPortRange: '5432' })
    w = step(playersOn(w), 30_000)
    expect(sessions(w)).toBe(0)
    expect(azure.trafficOf(w, VM_GAME)?.counters.refusedReason).toContain('Game API is degraded')
  })

  it('the incident: players already in a match stay, new ones are refused (NSG-4)', () => {
    let w = minutes(playersOn(pixelForgeWithApps()), 5)
    expect(sessions(w)).toBe(600)
    w = securityRule(w, NSG_GAME, 'Deny-Internet-Inbound', { priority: 100, access: 'Deny', protocol: '*', destinationPortRange: '*' }, JONAS)
    const atRule = sessions(w)
    w = minutes(w, 2)
    expect(sessions(w)).toBe(atRule)
    expect(azure.trafficOf(w, VM_GAME)?.counters.refusedReason).toBe('Denied by Deny-Internet-Inbound in nsg-snet-game.')
    // Sessions last 20 minutes; with no new players they drain to zero.
    w = minutes(w, 21)
    expect(sessions(w)).toBe(0)
  })

  it('is deterministic and survives save/load mid-traffic', () => {
    const w = step(playersOn(pixelForgeWithApps()), 95_500)
    expect(step(step(w, 33_000), 47_000)).toEqual(step(w, 80_000))
    const loaded = loadWorld(saveWorld(w))
    if (!loaded.ok) throw new Error(loaded.message)
    expect(step(loaded.world, 120_000)).toEqual(step(w, 120_000))
  })
})

describe('VM metrics (MON-6, RUN-5s)', () => {
  const series = (w: World, vm: string, name: string) => w.telemetry.metrics[vm.toLowerCase()]?.[name]?.items ?? []

  it('samples the MON-6 metrics once a minute from active sessions', () => {
    const w = minutes(playersOn(pixelForgeWithApps()), 2)
    const cpu = series(w, VM_GAME, 'Percentage CPU')
    const last = cpu.at(-1)
    if (!last) throw new Error('no CPU samples')
    expect(last[0] % azure.MINUTE_MS).toBe(0)
    expect(last[1]).toBeCloseTo(azure.METRIC_MODEL.cpuBase + azure.METRIC_MODEL.cpuPerSession * sessions(w))
    expect(series(w, VM_GAME, 'Network In Total').at(-1)?.[1]).toBeGreaterThan(0)
    expect(series(w, VM_GAME, 'Network Out Total').at(-1)?.[1]).toBe(sessions(w) * azure.METRIC_MODEL.outPerSession)
    // An idle VM still reports its base CPU.
    expect(series(w, VM_DB, 'Percentage CPU').at(-1)?.[1]).toBe(azure.METRIC_MODEL.cpuBase)
  })

  it('only for running VMs, keyed by the NIC-attached VM', () => {
    const w = minutes(pixelForge(), 1)
    expect(Object.keys(w.telemetry.metrics).sort()).toEqual([VM_DB.toLowerCase(), VM_GAME.toLowerCase()].sort())
    expect(NIC_GAME).toBeTruthy()
  })
})
