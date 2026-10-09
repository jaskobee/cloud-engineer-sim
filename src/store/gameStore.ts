import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  advance,
  azure,
  createRegistry,
  createWorld,
  dispatch as dispatchCommand,
  dryRun,
  type ArmId,
  type Command,
  type Outcome,
  type Refusal,
  type Registry,
  type World,
} from '../engine/index.ts'

/** Who the player is in the activity log (`caller`, MON-9). Mission data may override it later. */
export const PLAYER_PRINCIPAL = 'engineer@pixelforge.example'

/** Sim time 0: Friday 16 October 2026, 08:00 in Central Europe (06:00 UTC). Launch day. */
export const SANDBOX_EPOCH_MS = Date.UTC(2026, 9, 16, 6, 0, 0)

/**
 * The sandbox's own subscription, so the player can build before any client arrives. Missions bring their
 * client's subscriptions. The ID is made up (any GUID would do).
 */
export const SANDBOX_SUBSCRIPTION = { subscriptionId: '5a4d0b0c-0000-4000-8000-5a4d0b0c0001', displayName: 'Sandbox' } as const

export type AssistanceMode = 'guided' | 'standard' | 'expert'
/** Bottom panel tabs. Only tools that work are listed; more arrive with their steps. */
export type BottomTab = 'activity-log' | 'ip-flow-verify' | 'effective-rules'

/**
 * The "Create a resource" panel. `kind` null shows the type picker. `preset` pre-fills the form, e.g. to
 * edit an existing subnet (a write with the same name updates it) or add a rule to a chosen NSG.
 */
export interface CreateRequest {
  kind: string | null
  preset?: Record<string, string>
}

/** Everything that isn't the simulated world: what the player is looking at and how much help they get. */
export interface Session {
  missionId: string | null
  mode: AssistanceMode
  ui: { bottomTab: BottomTab; selectedId: ArmId | null; creating: CreateRequest | null }
}

export type PlayerCommand = Omit<Command, 'caller'> & { caller?: string }

export interface GameState {
  world: World
  session: Session
  /** The most recent refusal, for the UI to explain. Cleared by the next accepted command. */
  lastRefusal: Refusal | null
  /** The only way the UI changes the world. */
  dispatch(command: PlayerCommand): Outcome
  /** Review + create: what `dispatch` would refuse, without changing anything (null = passes). */
  check(command: PlayerCommand): Refusal | null
  /** Advance by real elapsed milliseconds (scaled by speed, nothing while paused). */
  tick(realMs: number): void
  selectTab(tab: BottomTab): void
  select(id: ArmId | null): void
  /** Open the create panel (or close it with null). Opening it clears the selection. */
  startCreate(request: CreateRequest | null): void
}

export type GameStore = StoreApi<GameState>

const DEFAULT_REGISTRY = createRegistry(azure.AZURE_COMMANDS)

/** A fresh sandbox world: empty apart from the sandbox subscription. Deterministic for a seed. */
export function newWorld(seed: string): World {
  const { world, outcome } = dispatchCommand(createWorld({ seed, epochMs: SANDBOX_EPOCH_MS }), DEFAULT_REGISTRY, {
    type: 'scenario/addSubscription',
    caller: 'scenario',
    payload: SANDBOX_SUBSCRIPTION,
  })
  if (outcome.status !== 'accepted') throw new Error('Could not create the sandbox subscription')
  return world
}

export function createGameStore({ world, registry = DEFAULT_REGISTRY }: { world: World; registry?: Registry }): GameStore {
  return createStore<GameState>()((set, get) => ({
    world,
    session: { missionId: null, mode: 'guided', ui: { bottomTab: 'activity-log', selectedId: null, creating: null } },
    lastRefusal: null,

    dispatch(command) {
      const { world: next, outcome } = dispatchCommand(get().world, registry, { ...command, caller: command.caller ?? PLAYER_PRINCIPAL })
      set({ world: next, lastRefusal: outcome.status === 'refused' ? outcome.refusal : null })
      return outcome
    },

    check(command) {
      return dryRun(get().world, registry, { ...command, caller: command.caller ?? PLAYER_PRINCIPAL })
    },

    tick(realMs) {
      const current = get().world
      const next = advance(current, realMs)
      if (next !== current) set({ world: next })
    },

    selectTab(tab) {
      set(s => ({ session: { ...s.session, ui: { ...s.session.ui, bottomTab: tab } } }))
    },

    select(id) {
      set(s => ({ session: { ...s.session, ui: { ...s.session.ui, selectedId: id, creating: id === null ? s.session.ui.creating : null } } }))
    },

    startCreate(request) {
      set(s => ({ session: { ...s.session, ui: { ...s.session.ui, creating: request, selectedId: request ? null : s.session.ui.selectedId } } }))
    },
  }))
}
