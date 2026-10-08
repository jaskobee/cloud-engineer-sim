import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  advance,
  azure,
  createRegistry,
  createWorld,
  dispatch as dispatchCommand,
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

export type AssistanceMode = 'guided' | 'standard' | 'expert'
/** Bottom panel tabs. Only tools that work are listed; more arrive with their steps. */
export type BottomTab = 'activity-log'

/** Everything that isn't the simulated world: what the player is looking at and how much help they get. */
export interface Session {
  missionId: string | null
  mode: AssistanceMode
  ui: { bottomTab: BottomTab; selectedId: ArmId | null }
}

export type PlayerCommand = Omit<Command, 'caller'> & { caller?: string }

export interface GameState {
  world: World
  session: Session
  /** The most recent refusal, for the UI to explain. Cleared by the next accepted command. */
  lastRefusal: Refusal | null
  /** The only way the UI changes the world. */
  dispatch(command: PlayerCommand): Outcome
  /** Advance by real elapsed milliseconds (scaled by speed, nothing while paused). */
  tick(realMs: number): void
  selectTab(tab: BottomTab): void
  select(id: ArmId | null): void
}

export type GameStore = StoreApi<GameState>

export function newWorld(seed: string): World {
  return createWorld({ seed, epochMs: SANDBOX_EPOCH_MS })
}

export function createGameStore({ world, registry = createRegistry(azure.AZURE_COMMANDS) }: { world: World; registry?: Registry }): GameStore {
  return createStore<GameState>()((set, get) => ({
    world,
    session: { missionId: null, mode: 'guided', ui: { bottomTab: 'activity-log', selectedId: null } },
    lastRefusal: null,

    dispatch(command) {
      const { world: next, outcome } = dispatchCommand(get().world, registry, { ...command, caller: command.caller ?? PLAYER_PRINCIPAL })
      set({ world: next, lastRefusal: outcome.status === 'refused' ? outcome.refusal : null })
      return outcome
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
      set(s => ({ session: { ...s.session, ui: { ...s.session.ui, selectedId: id } } }))
    },
  }))
}
