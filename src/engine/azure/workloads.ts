import type { System } from '../clock.ts'
import { invalid, type CommandHandler } from '../commands.ts'
import type { ArmId, Resource, RuntimeState, ServiceState, Workload, World } from '../world.ts'
import { armKey, parentResourceId, sameName } from './armId.ts'
import { parseIPv4 } from './cidr.ts'
import { getResource, resourcesOfType } from './common.ts'
import { ipFlowVerify, type IpFlowVerifyResult } from './flow.ts'
import { ipConfigurationsOf } from './networkInterfaces.ts'
import { networkInterfacesOf, powerStateOf, VM_TYPE } from './virtualMachines.ts'
import { NIC_TYPE } from './virtualNetworks.ts'

/**
 * Simulated apps on VMs and their health (RUN-1s, RUN-2s). Not Azure resources: the commands are
 * scenario commands (no activity log entry), and every reachability question goes to the flow
 * evaluator (CLAUDE.md rule 5).
 */

/** Ephemeral source port the sim uses for the app's own outbound connections (made up). */
export const APP_SOURCE_PORT = 50000

// ── Lookups ────────────────────────────────────────────────────────────────────────────────────

export const workloadsOf = (world: World): Record<ArmId, Workload> => world.external.workloads ?? {}
export const workloadOf = (world: World, vmId: ArmId): Workload | undefined => workloadsOf(world)[armKey(vmId)]

/** The VM's primary NIC (VM-16s: the sim gives each VM one NIC). */
export function primaryNicOf(world: World, vm: Resource): Resource | undefined {
  const refs = networkInterfacesOf(vm)
  const ref = refs.find(n => n.properties.primary) ?? refs[0]
  return ref ? getResource(world, ref.id) : undefined
}

export const privateIpOf = (nic: Resource): string => ipConfigurationsOf(nic)[0]?.properties.privateIPAddress ?? ''

/** The VM a NIC is attached to, if any. */
export function vmOfNic(world: World, nic: Resource): Resource | undefined {
  return resourcesOfType(world, VM_TYPE).find(vm => networkInterfacesOf(vm).some(n => sameName(n.id, nic.id)))
}

const vnetOfNic = (nic: Resource) => parentResourceId(ipConfigurationsOf(nic)[0]?.properties.subnet.id ?? '')?.toLowerCase()

/** The NIC holding `ip` in the same virtual network as `from` (private IPs repeat across VNets). */
export function nicWithIpInVnet(world: World, from: Resource, ip: string): Resource | undefined {
  return resourcesOfType(world, NIC_TYPE).find(n => privateIpOf(n) === ip && vnetOfNic(n) === vnetOfNic(from))
}

// ── Commands ───────────────────────────────────────────────────────────────────────────────────

export interface SetWorkload {
  vmId: ArmId
  /** Null removes the app. */
  workload: Workload | null
}

function workloadProblem(w: unknown): string | null {
  if (w === null) return null
  if (typeof w !== 'object') return 'The app must be an object or null.'
  const x = w as Record<string, unknown>
  if (x.kind === 'postgres') return x.port === 5432 ? null : 'PostgreSQL listens on TCP 5432.'
  if (x.kind === 'game-api') {
    if (x.port !== 443) return 'The game API listens on TCP 443 (HTTPS).'
    const db = x.database as Record<string, unknown> | undefined
    if (!db || typeof db.ip !== 'string' || parseIPv4(db.ip) === null) return 'The game API needs the private IP address of its PostgreSQL server.'
    return db.port === 5432 ? null : 'PostgreSQL listens on TCP 5432.'
  }
  return "The simulated apps are 'game-api' and 'postgres'."
}

/** Install or remove a simulated app on a VM (RUN-1s). A scenario command: no activity log entry. */
export const setWorkload: CommandHandler<SetWorkload> = {
  type: 'scenario/setWorkload',
  write: () => null,
  validate(world, { payload }) {
    const vm = getResource(world, payload.vmId)
    if (!vm || vm.type.toLowerCase() !== VM_TYPE.toLowerCase()) return invalid('arm/not-found', `Virtual machine '${payload.vmId}' doesn't exist.`)
    const problem = workloadProblem(payload.workload)
    return problem ? invalid('scenario/invalid-workload', problem) : null
  },
  apply(world, { payload }) {
    const key = armKey(payload.vmId)
    const workloads = { ...workloadsOf(world) }
    if (payload.workload) workloads[key] = payload.workload
    else delete workloads[key]
    let runtime = world.runtime
    let traffic = world.traffic
    if (!payload.workload) {
      const current = runtime[key]
      if (current?.service) {
        const rest: RuntimeState = { ...current, health: 'unknown', reasons: [] }
        delete rest.service
        runtime = { ...runtime, [key]: rest }
      }
      if (traffic?.[key]) {
        traffic = { ...traffic }
        delete traffic[key]
      }
    }
    return { ...world, runtime, ...(traffic ? { traffic } : {}), external: { ...world.external, workloads } }
  },
}

export const TRAFFIC_PROFILES = ['beta-launch'] as const
export type TrafficProfile = (typeof TRAFFIC_PROFILES)[number]

/** Switch player traffic on or off (RUN-3s). A scenario command: no activity log entry. */
export const setTraffic: CommandHandler<{ profile: TrafficProfile | null }> = {
  type: 'scenario/setTraffic',
  write: () => null,
  validate: (_w, { payload }) =>
    payload.profile === null || (TRAFFIC_PROFILES as readonly string[]).includes(payload.profile)
      ? null : invalid('scenario/invalid-traffic', `Traffic profiles: ${TRAFFIC_PROFILES.join(', ')}, or null for off.`),
  apply: (world, { payload }) => ({ ...world, external: { ...world.external, traffic: { profile: payload.profile } } }),
}

// ── Health ─────────────────────────────────────────────────────────────────────────────────────

/** Why a check failed, in words, or null when it was allowed. */
function blocked(check: IpFlowVerifyResult, vmName: string, direction: string): string | null {
  if (!check.ok) return `${check.refusal.message}${check.refusal.kind === 'invalid' ? '' : ` (${check.refusal.ruleId})`}`
  if (check.access === 'Access allowed') return null
  return check.ruleName
    ? `denied by ${check.ruleName}${check.nsgName ? ` in ${check.nsgName}` : ''} (${direction} at ${vmName})`
    : `no network security group allows it (${direction} at ${vmName})`
}

/** Can the game API on `vm` reach its database? Both ends go to the flow evaluator (NSG-7, RUN-2s). */
function databaseReason(world: World, vm: Resource, db: { ip: string; port: number }): string | null {
  const nic = primaryNicOf(world, vm)
  if (!nic) return 'The VM has no network interface.'
  const target = `PostgreSQL at ${db.ip}:${db.port}`
  const dbNic = nicWithIpInVnet(world, nic, db.ip)
  const dbVm = dbNic ? vmOfNic(world, dbNic) : undefined
  if (!dbNic || !dbVm) return `Can't reach ${target}: no VM has that address in this virtual network.`
  if (workloadOf(world, dbVm.id)?.kind !== 'postgres') return `Can't reach ${target}: ${dbVm.name} doesn't run PostgreSQL.`
  if (powerStateOf(world, dbVm.id) !== 'running') return `Can't reach ${target}: ${dbVm.name} isn't running.`
  const localIp = privateIpOf(nic)
  const out = ipFlowVerify(world, { vmId: vm.id, direction: 'Outbound', protocol: 'Tcp', localIp, localPort: APP_SOURCE_PORT, remoteIp: db.ip, remotePort: db.port })
  const outWhy = blocked(out, vm.name, 'outbound')
  if (outWhy) return `Can't reach ${target}: ${outWhy}.`
  const inb = ipFlowVerify(world, { vmId: dbVm.id, direction: 'Inbound', protocol: 'Tcp', localIp: db.ip, localPort: db.port, remoteIp: localIp, remotePort: APP_SOURCE_PORT })
  const inWhy = blocked(inb, dbVm.name, 'inbound')
  return inWhy ? `Can't reach ${target}: ${inWhy}.` : null
}

const APP_NAME: Record<Workload['kind'], string> = { 'game-api': 'Game API', postgres: 'PostgreSQL' }

export function serviceStateOf(world: World, vm: Resource, workload: Workload): ServiceState {
  const name = APP_NAME[workload.kind]
  if (powerStateOf(world, vm.id) !== 'running') return { kind: workload.kind, status: 'down', reason: `${name} is down: ${vm.name} isn't running.` }
  if (workload.kind === 'postgres') return { kind: workload.kind, status: 'up', reason: `${name} accepts connections on TCP 5432.` }
  const why = databaseReason(world, vm, workload.database)
  return why
    ? { kind: workload.kind, status: 'degraded', reason: `${name} is degraded (/health answers 503). ${why}` }
    : { kind: workload.kind, status: 'up', reason: `${name} is up on HTTPS 443 and connected to its database.` }
}

const HEALTH: Record<ServiceState['status'], RuntimeState['health']> = { up: 'healthy', degraded: 'degraded', down: 'unhealthy' }

/**
 * Runtime system: re-checks every app's health each sim second (RUN-2s). Writes only what changed,
 * so the runtime object stays the same while nothing happens.
 */
export const workloadHealthSystem: System = world => {
  let runtime = world.runtime
  for (const [key, workload] of Object.entries(workloadsOf(world))) {
    const vm = world.tenant.resources[key]
    if (!vm) continue
    const next = serviceStateOf(world, vm, workload)
    const current = runtime[key]
    if (current?.service && current.service.status === next.status && current.service.reason === next.reason) continue
    if (runtime === world.runtime) runtime = { ...runtime }
    runtime[key] = {
      ...(current ?? { reasons: [] }),
      health: HEALTH[next.status],
      reasons: next.status === 'up' ? [] : [{ code: `service-${next.status}` }],
      service: next,
    }
  }
  return runtime === world.runtime ? world : { ...world, runtime }
}
