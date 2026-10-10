import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  advance,
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
import { registryFor, runtimeFor } from '../missions/index.ts'

/** Who the player is in the activity log (`caller`, MON-9). Mission data may override it later. */
export const PLAYER_PRINCIPAL = 'engineer@pixelforge.example'

/** Sim time 0: Friday 16 October 2026, 08:00 in Central Europe (06:00 UTC). Launch day. */
export const SANDBOX_EPOCH_MS = Date.UTC(2026, 9, 16, 6, 0, 0)

/**
 * The sandbox's own subscription, so the player can build before any client arrives. Missions bring their
 * client's subscriptions. The ID is made up (any GUID would do).
 */
export const SANDBOX_SUBSCRIPTION = { subscriptionId: '5a4d0b0c-0000-4000-8000-5a4d0b0c0001', displayName: 'Sandbox' } as const

/** Bottom panel tabs. Only tools that work are listed; more arrive with their steps. */
export type BottomTab = 'activity-log' | 'deployments' | 'metrics' | 'availability' | 'alerts' | 'ip-flow-verify' | 'effective-rules'

/**
 * The "Create a resource" panel. `kind` null shows the type picker. `preset` pre-fills the form, e.g. to
 * edit an existing subnet (a write with the same name updates it) or add a rule to a chosen NSG.
 */
export interface CreateRequest {
  kind: string | null
  preset?: Record<string, string>
}

/** Canvas layers change emphasis, never data (visual-infrastructure skill, D-5). */
export type CanvasLayer = 'network' | 'security' | 'health'

/**
 * A connection the canvas watches (D-5): pinned from IP flow verify, later also declared by missions.
 * Seen from `vmId`'s primary NIC, in IP flow verify's terms (NW-1). View state, never world state.
 */
export interface WatchedFlow {
  id: string
  vmId: ArmId
  direction: 'Inbound' | 'Outbound'
  protocol: 'Tcp' | 'Udp'
  localPort: number
  remoteIp: string
  remotePort: number
  /** What the connection is for, when a mission declares it (e.g. "Players → game API"). */
  label?: string
  /** Declared by the mission: always watched, can't be unpinned. */
  fromMission?: boolean
}

/** A watched flow's ID: the same connection always gets the same ID, whoever watches it. */
export const watchedFlowId = (flow: Omit<WatchedFlow, 'id'>): string =>
  [flow.vmId.toLowerCase(), flow.direction, flow.protocol, flow.localPort, flow.remoteIp, flow.remotePort].join('|')

/** Selection IDs for watched flows, so the inspector can show a flow like a resource. */
export const FLOW_SELECTION_PREFIX = 'flow:'

/** Everything that isn't the simulated world: what the player is looking at. (The mission's mode and hints are in the world.) */
export interface Session {
  ui: {
    bottomTab: BottomTab
    /** An ARM ID, or `flow:<id>` for a watched flow. */
    selectedId: ArmId | null
    creating: CreateRequest | null
    canvas: { layer: CanvasLayer; watched: WatchedFlow[] }
    /** Mission messages the player has seen; newer ones count as unread. */
    seenMessages: number
    /** The INFO topic open in the INFO dialog, if any. */
    info: string | null
  }
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
  setCanvasLayer(layer: CanvasLayer): void
  /** Watch a connection on the canvas (the same connection twice is kept once) and select it. */
  watchFlow(flow: Omit<WatchedFlow, 'id'>): string
  unwatchFlow(id: string): void
  markMessagesSeen(count: number): void
  openInfo(topic: string | null): void
}

export type GameStore = StoreApi<GameState>

const DEFAULT_REGISTRY = registryFor(undefined)

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

/**
 * The store for one game. Commands and time run with the world's runtime: the default registry and
 * systems, plus its mission's commands and system when it has a mission (step 9). Tests may pass a
 * registry of their own.
 */
export function createGameStore({ world, registry }: { world: World; registry?: Registry }): GameStore {
  return createStore<GameState>()((set, get) => {
    const runtime = () => {
      const r = runtimeFor(get().world)
      return registry ? { ...r, registry } : r
    }
    return {
      world,
      session: {
        ui: { bottomTab: 'activity-log', selectedId: null, creating: null, canvas: { layer: 'network', watched: [] }, seenMessages: 0, info: null },
      },
      lastRefusal: null,

      dispatch(command) {
        const { world: next, outcome } = dispatchCommand(get().world, runtime().registry, { ...command, caller: command.caller ?? PLAYER_PRINCIPAL })
        set({ world: next, lastRefusal: outcome.status === 'refused' ? outcome.refusal : null })
        return outcome
      },

      check(command) {
        return dryRun(get().world, runtime().registry, { ...command, caller: command.caller ?? PLAYER_PRINCIPAL })
      },

      tick(realMs) {
        const current = get().world
        const next = advance(current, realMs, runtime().systems)
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

      setCanvasLayer(layer) {
        set(s => ({ session: { ...s.session, ui: { ...s.session.ui, canvas: { ...s.session.ui.canvas, layer } } } }))
      },

      watchFlow(flow) {
        const id = watchedFlowId(flow)
        set(s => {
          const { canvas } = s.session.ui
          const watched = canvas.watched.some(w => w.id === id) ? canvas.watched : [...canvas.watched, { ...flow, id }]
          return { session: { ...s.session, ui: { ...s.session.ui, creating: null, selectedId: `${FLOW_SELECTION_PREFIX}${id}`, canvas: { ...canvas, watched } } } }
        })
        return id
      },

      unwatchFlow(id) {
        set(s => {
          const { canvas, selectedId } = s.session.ui
          return {
            session: {
              ...s.session,
              ui: {
                ...s.session.ui,
                selectedId: selectedId === `${FLOW_SELECTION_PREFIX}${id}` ? null : selectedId,
                canvas: { ...canvas, watched: canvas.watched.filter(w => w.id !== id) },
              },
            },
          }
        })
      },

      openInfo(topic) {
        set(s => ({ session: { ...s.session, ui: { ...s.session.ui, info: topic } } }))
      },

      markMessagesSeen(count) {
        if (get().session.ui.seenMessages >= count) return
        set(s => ({ session: { ...s.session, ui: { ...s.session.ui, seenMessages: count } } }))
      },
    }
  })
}
