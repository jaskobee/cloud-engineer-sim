import type { ActivityLogEntry } from './activityLog.ts'
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
  /** ARM-named configuration. */
  properties: Record<string, unknown>
  /** The exact set of values is pinned by ARM-1u before the deployment engine (step 6). */
  provisioningState: string
  createdBy: string
  changedAt: number
}

export interface Tenant {
  subscriptions: Record<string, Subscription>
  resourceGroups: Record<ArmId, ResourceGroup>
  resources: Record<ArmId, Resource>
}

/** A deployment: operations that progress over sim time. Fleshed out by the deployment engine (step 6). */
export interface Deployment {
  id: string
  correlationId: string
  startedAt: number
  completedAt?: number
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
  traffic: { profile: string | null }
  actors: Actor[]
  probeLocations: string[]
}

// ── EVIDENCE: bounded ───────────────────────────────────────────────────────────────────────────

export interface AvailabilityResult {
  time: number
  location: string
  success: boolean
  durationMs: number
  message: string
}

export interface Telemetry {
  availability: RingBuffer<AvailabilityResult>
  /** resource ID → metric name (MON-6 names) → [sim time, value] samples. */
  metrics: Record<ArmId, Record<string, RingBuffer<[number, number]>>>
}

export interface FiredAlert {
  alertRuleId: ArmId
  firedAt: number
  resolvedAt?: number
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
