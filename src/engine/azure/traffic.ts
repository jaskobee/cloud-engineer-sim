import type { System, Tick } from '../clock.ts'
import { createRingBuffer, pushRing } from '../ringBuffer.ts'
import { TELEMETRY_CAPACITY, type ArmId, type ConnectionCounters, type Resource, type TrafficState, type World } from '../world.ts'
import { ipFlowVerify } from './flow.ts'
import { ipConfigurationsOf } from './networkInterfaces.ts'
import { powerStateOf, VM_TYPE } from './virtualMachines.ts'
import { primaryNicOf, privateIpOf, workloadsOf } from './workloads.ts'

/**
 * Player traffic and VM metrics (RUN-3s … RUN-5s). Every number here is made up and game-paced;
 * every allow/deny comes from the flow evaluator (CLAUDE.md rule 5).
 */

export const MINUTE_MS = 60_000
/** `beta-launch`: new connections per sim minute and session length (RUN-3s). */
export const BETA_LAUNCH = { connectionsPerMinute: 120, sessionMs: 20 * MINUTE_MS }
/** Metric coefficients (RUN-5s). */
export const METRIC_MODEL = { cpuBase: 2, cpuPerSession: 0.025, inPerSession: 12_000, inPerNewConnection: 4_000, outPerSession: 48_000 }

export const trafficOf = (world: World, vmId: ArmId): TrafficState | undefined => world.traffic?.[vmId.toLowerCase()]

export const activeSessions = (state: TrafficState | undefined): number =>
  (state?.sessions ?? []).reduce((n, g) => n + g.count, 0)

/** New connections arriving in this tick: 120 a minute = exactly 2 per sim second, no randomness. */
function arrivals(tick: Tick): number {
  const per = BETA_LAUNCH.connectionsPerMinute
  return Math.floor((tick.end * per) / MINUTE_MS) - Math.floor((tick.start * per) / MINUTE_MS)
}

/** A representative player address for a minute, from 198.51.100.0/24 (documentation range, RUN-3s). */
export const playerIpForMinute = (minuteStart: number) => `198.51.100.${20 + (Math.floor(minuteStart / MINUTE_MS) % 200)}`

/** Why a new player connection to the game API is refused right now, or null when it's accepted (RUN-4s). */
export function refusalForNewConnection(world: World, vm: Resource, remoteIp: string): string | null {
  if (powerStateOf(world, vm.id) !== 'running') return `${vm.name} isn't running.`
  const nic = primaryNicOf(world, vm)
  if (!nic) return `${vm.name} has no network interface.`
  if (!ipConfigurationsOf(nic)[0]?.properties.publicIPAddress) return `${nic.name} has no public IP address, so players on the internet can't reach it (PIP-10s).`
  const check = ipFlowVerify(world, { vmId: vm.id, direction: 'Inbound', protocol: 'Tcp', localIp: privateIpOf(nic), localPort: 443, remoteIp, remotePort: 50000 })
  if (!check.ok) return check.refusal.message
  if (check.access === 'Access denied') {
    return check.ruleName ? `Denied by ${check.ruleName}${check.nsgName ? ` in ${check.nsgName}` : ''}.` : 'No network security group allows it.'
  }
  const service = world.runtime[vm.id.toLowerCase()]?.service
  if (service && service.status !== 'up') return service.reason
  return null
}

/**
 * Traffic system: ends finished sessions, drops everything when the VM stops running, and lets new
 * players connect while a profile is on. New connections are checked once, when they start;
 * established ones aren't re-checked after a rule change (NSG-4, RUN-4s).
 */
export const trafficSystem: System = (world, tick) => {
  const profileOn = world.external.traffic.profile === 'beta-launch'
  const minuteStart = Math.floor(tick.start / MINUTE_MS) * MINUTE_MS
  let traffic = world.traffic
  for (const [key, workload] of Object.entries(workloadsOf(world))) {
    if (workload.kind !== 'game-api') continue
    const vm = world.tenant.resources[key]
    if (!vm) continue
    const current = traffic?.[key]
    if (!current && !profileOn) continue

    const running = powerStateOf(world, vm.id) === 'running'
    let sessions = running ? (current?.sessions ?? []).filter(g => g.endsAt > tick.end) : []
    let counters: ConnectionCounters = current && current.counters.minuteStart === minuteStart
      ? current.counters
      : { minuteStart, accepted: 0, refused: 0, refusedReason: null }

    const n = profileOn ? arrivals(tick) : 0
    if (n > 0) {
      const remoteIp = playerIpForMinute(minuteStart)
      const why = refusalForNewConnection(world, vm, remoteIp)
      if (why) {
        counters = { ...counters, refused: counters.refused + n, refusedReason: why }
      } else {
        counters = { ...counters, accepted: counters.accepted + n }
        const last = sessions.at(-1)
        sessions = last && last.startedAt === minuteStart
          ? [...sessions.slice(0, -1), { ...last, count: last.count + n }]
          : [...sessions, { startedAt: minuteStart, endsAt: minuteStart + BETA_LAUNCH.sessionMs, count: n, remoteIp }]
      }
    }

    const unchanged = current && sessions.length === current.sessions.length && sessions.every((g, i) => g === current.sessions[i]) && counters === current.counters
    if (unchanged) continue
    traffic = { ...(traffic ?? {}), [key]: { sessions, counters } }
  }
  return traffic === world.traffic ? world : { ...world, traffic: traffic ?? {} }
}

/** Metrics system: samples MON-6 VM metrics of running VMs once a sim minute (RUN-5s). */
export const metricsSystem: System = (world, tick) => {
  if (tick.end % MINUTE_MS !== 0) return world
  const minuteStart = tick.end - MINUTE_MS
  const m = METRIC_MODEL
  let metrics = world.telemetry.metrics
  for (const vm of Object.values(world.tenant.resources)) {
    if (vm.type.toLowerCase() !== VM_TYPE.toLowerCase() || powerStateOf(world, vm.id) !== 'running') continue
    const key = vm.id.toLowerCase()
    const state = world.traffic?.[key]
    const active = activeSessions(state)
    const fresh = state && state.counters.minuteStart === minuteStart ? state.counters.accepted : 0
    const samples: Record<string, number> = {
      'Percentage CPU': Math.min(100, m.cpuBase + m.cpuPerSession * active),
      'Network In Total': active * m.inPerSession + fresh * m.inPerNewConnection,
      'Network Out Total': active * m.outPerSession,
    }
    const series = { ...(metrics[key] ?? {}) }
    for (const [name, value] of Object.entries(samples)) {
      series[name] = pushRing(series[name] ?? createRingBuffer<[number, number]>(TELEMETRY_CAPACITY), [tick.end, value])
    }
    if (metrics === world.telemetry.metrics) metrics = { ...metrics }
    metrics[key] = series
  }
  return metrics === world.telemetry.metrics ? world : { ...world, telemetry: { ...world.telemetry, metrics } }
}
