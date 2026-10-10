import type { ActivityLogEntry } from './activityLog.ts'
import type { Deployment } from './deployments.ts'
import { createRingBuffer, type RingBuffer } from './ringBuffer.ts'
import { seedRng, type RngState } from './rng.ts'

/** Version of the saved world format. Bump it (and add a migration in save.ts) on any breaking change. */
export const WORLD_SCHEMA_VERSION = 1 as const

/** A full Azure Resource Manager resource ID. Builders and parsing arrive with the resource types (step 4). */
export type ArmId = string

/** Speeds the time controls offer (pause / 1× / fast-forward). */
export const CLOCK_SPEEDS = [1, 4, 16] as const
export type ClockSpeed = (typeof CLOCK_SPEEDS)[number]

export interface Clock {
  /** Sim milliseconds since the scenario started. */
  now: number
  /** Calendar time (Unix ms) that sim time 0 represents. Set by the scenario; the UI formats dates from it. */
  epochMs: number
  speed: ClockSpeed
  paused: boolean
}

export interface WorldRng {
  seed: string
  /** Gameplay randomness (traffic, probe timing, …). */
  game: RngState
  /** Identifiers only, so issuing commands never shifts gameplay randomness. */
  ids: RngState
}

// ── DESIRED: what someone asked for ────────────────────────────────────────────────────────────

export interface Subscription {
  subscriptionId: string
  displayName: string
}

export interface ResourceGroup {
  id: ArmId
  name: string
  location: string
  tags: Record<string, string>
}

export interface Resource {
  id: ArmId
  /** ARM resource type, e.g. `Microsoft.Network/virtualNetworks`. */
  type: string
  name: string
  location: string
  tags: Record<string, string>
  /** Top-level ARM `sku`, for the types that have one (e.g. public IP addresses, PIP-6). */
  sku?: { name: string; tier?: string }
  /** Top-level ARM `kind`, for the types that have one (e.g. Application Insights `web`, MON-15). */
  kind?: string
  /** ARM-named configuration. */
  properties: Record<string, unknown>
  /** ARM-1 values: `Succeeded`, or `Creating` / `Updating` / `Deleting` while a deployment runs (ARM-1s). */
  provisioningState: string
  createdBy: string
  changedAt: number
}

export interface Tenant {
  subscriptions: Record<string, Subscription>
  resourceGroups: Record<ArmId, ResourceGroup>
  resources: Record<ArmId, Resource>
}


// ── ACTUAL: recomputed from desired state by the runtime and flow engine ─────────────────────────

export type Health = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

export interface HealthReason {
  code: string
  /** Pointer to the evidence, e.g. an activity log `eventDataId`. */
  evidence?: string
}

export interface RuntimeState {
  health: Health
  reasons: HealthReason[]
  /** Virtual machines only: the power state, as in the instance view `PowerState/<state>` (VM-7). */
  powerState?: 'creating' | 'starting' | 'running' | 'stopping' | 'stopped' | 'deallocating' | 'deallocated'
  /** Virtual machines with a simulated app (RUN-1s): how the app is doing (RUN-2s). */
  service?: ServiceState
}

/** A simulated app on a VM (RUN-1s). Not an Azure resource. */
export type Workload =
  | { kind: 'game-api'; port: 443; database: { ip: string; port: 5432 } }
  | { kind: 'postgres'; port: 5432 }

export interface ServiceState {
  kind: Workload['kind']
  status: 'up' | 'degraded' | 'down'
  /** Plain-language reason, e.g. which rule blocks the database. */
  reason: string
}

/** Sessions that started in the same sim minute: one connection record per group (RUN-4s). */
export interface SessionGroup {
  startedAt: number
  endsAt: number
  count: number
  /** A representative player address (documentation range, RUN-3s). */
  remoteIp: string
}

/** New connections in the current sim minute (RUN-4s, RUN-5s). */
export interface ConnectionCounters {
  minuteStart: number
  accepted: number
  refused: number
  /** Why the latest refused connection was refused. */
  refusedReason: string | null
}

/**
 * Player traffic to one VM. Kept outside `runtime` because it changes every sim second while players
 * connect, and views that only need health shouldn't re-render that often.
 */
export interface TrafficState {
  sessions: SessionGroup[]
  counters: ConnectionCounters
}

// ── OUTSIDE WORLD ───────────────────────────────────────────────────────────────────────────────

export interface Actor {
  id: string
  displayName: string
  role: string
  /** What the activity log shows as `caller` (MON-9). */
  principalName: string
}

export interface External {
  /** Player traffic profile (RUN-3s): `beta-launch` or null (off). */
  traffic: { profile: string | null }
  actors: Actor[]
  probeLocations: string[]
  /** Simulated apps by lower-cased VM ID (RUN-1s). Optional: saves from before step 8 don't have it. */
  workloads?: Record<ArmId, Workload>
}

// ── EVIDENCE: bounded ───────────────────────────────────────────────────────────────────────────

/**
 * One availability test run, shaped like an `AppAvailabilityResults` row (MON-21, MON-27s). `webTestId`
 * is the sim's link to the test resource.
 */
export interface AvailabilityResult {
  TimeGenerated: number
  /** The test's `Name` property. */
  Name: string
  /** Display name of the test location (MON-18). */
  Location: string
  Success: boolean
  DurationMs: number
  Message: string
  webTestId: ArmId
}

export interface Telemetry {
  /** The newest test results across all availability tests (MON-27s). */
  availability: RingBuffer<AvailabilityResult>
  /** resource ID → metric name (MON-6 names) → [sim time, value] samples. */
  metrics: Record<ArmId, Record<string, RingBuffer<[number, number]>>>
}

/** A fired metric alert (MON-24, MON-28s). `monitorCondition` is set by the system; the user response stays New. */
export interface FiredAlert {
  id: string
  alertRuleId: ArmId
  alertRuleName: string
  severity: number
  description: string
  monitorCondition: 'Fired' | 'Resolved'
  userResponse: 'New'
  firedAt: number
  resolvedAt?: number
  /** Locations whose newest result had failed when it fired. */
  failedLocations: string[]
  /** Consecutive evaluations with the condition not met (three resolve it, MON-24). */
  clearChecks: number
}

/** Capacity of each telemetry series: one day of one-minute samples. */
export const TELEMETRY_CAPACITY = 1440

/**
 * The one authoritative simulation state. Plain JSON data. It changes only through a command
 * (`dispatch`) or time (`step`). Desired configuration, deployments, actual runtime state,
 * the outside world and evidence are kept apart (bootstrap report §F).
 */
export interface World {
  schemaVersion: typeof WORLD_SCHEMA_VERSION
  clock: Clock
  rng: WorldRng
  tenant: Tenant
  deployments: Record<string, Deployment>
  runtime: Record<ArmId, RuntimeState>
  /** Player traffic by lower-cased VM ID (RUN-4s). Optional: saves from before step 8 don't have it. */
  traffic?: Record<ArmId, TrafficState>
  external: External
  activityLog: ActivityLogEntry[]
  telemetry: Telemetry
  alerts: { fired: FiredAlert[] }
}

export interface WorldOptions {
  seed: string
  epochMs: number
}

/** An empty world. Scenarios populate it through commands, never by editing it directly. */
export function createWorld({ seed, epochMs }: WorldOptions): World {
  return {
    schemaVersion: WORLD_SCHEMA_VERSION,
    clock: { now: 0, epochMs, speed: 1, paused: false },
    rng: { seed, game: seedRng(`${seed}:game`), ids: seedRng(`${seed}:ids`) },
    tenant: { subscriptions: {}, resourceGroups: {}, resources: {} },
    deployments: {},
    runtime: {},
    external: { traffic: { profile: null }, actors: [], probeLocations: [] },
    activityLog: [],
    telemetry: { availability: createRingBuffer<AvailabilityResult>(TELEMETRY_CAPACITY), metrics: {} },
    alerts: { fired: [] },
  }
}
