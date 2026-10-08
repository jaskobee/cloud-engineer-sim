import { describe, expect, it } from 'vitest'
import { TICK_MS } from '../../src/engine/index.ts'
import { PLAYER_PRINCIPAL, SANDBOX_SUBSCRIPTION, createGameStore, newWorld } from '../../src/store/gameStore.ts'

const store = () => createGameStore({ world: newWorld('store-test') })

describe('game store', () => {
  it('starts on the given world with a default session', () => {
    const s = store().getState()
    expect(s.world.rng.seed).toBe('store-test')
    expect(s.session).toEqual({ missionId: null, mode: 'guided', ui: { bottomTab: 'activity-log', selectedId: null, creating: null } })
    expect(s.lastRefusal).toBeNull()
  })

  it('dispatches through the engine, as the player unless another caller is given', () => {
    const st = store()
    const outcome = st.getState().dispatch({ type: 'sim/setSpeed', payload: { speed: 4 } })
    expect(outcome.status).toBe('accepted')
    expect(st.getState().world.clock.speed).toBe(4)
    expect(PLAYER_PRINCIPAL).toMatch(/@/)
  })

  it('keeps the last refusal so the UI can explain it, and clears it on the next accepted command', () => {
    const st = store()
    st.getState().dispatch({ type: 'sim/setSpeed', payload: { speed: 3 } })
    expect(st.getState().lastRefusal).toMatchObject({ kind: 'invalid', code: 'sim/invalid-speed' })
    st.getState().dispatch({ type: 'sim/setSpeed', payload: { speed: 16 } })
    expect(st.getState().lastRefusal).toBeNull()
  })

  it('tick advances sim time by real time × speed', () => {
    const st = store()
    st.getState().dispatch({ type: 'sim/setSpeed', payload: { speed: 16 } })
    st.getState().tick(500)
    expect(st.getState().world.clock.now).toBe(8_000)
  })

  it('does not notify subscribers while paused (no re-render per frame)', () => {
    const st = store()
    st.getState().dispatch({ type: 'sim/setPaused', payload: { paused: true } })
    let notified = 0
    const unsubscribe = st.subscribe(() => notified++)
    st.getState().tick(TICK_MS * 5)
    unsubscribe()
    expect(notified).toBe(0)
    expect(st.getState().world.clock.now).toBe(0)
  })

  it('changes UI session state without touching the world', () => {
    const st = store()
    const world = st.getState().world
    st.getState().select('/subscriptions/x/resourceGroups/rg')
    expect(st.getState().session.ui.selectedId).toBe('/subscriptions/x/resourceGroups/rg')
    expect(st.getState().world).toBe(world)
  })

  it('newWorld is deterministic for a seed and starts on a Friday morning', () => {
    expect(newWorld('a')).toEqual(newWorld('a'))
    const start = new Date(newWorld('a').clock.epochMs)
    expect(start.getUTCDay()).toBe(5)
  })
})

describe('game store: building (step 4b)', () => {
  it('a new world has the sandbox subscription and no activity yet', () => {
    const w = newWorld('sandbox')
    expect(w.tenant.subscriptions[SANDBOX_SUBSCRIPTION.subscriptionId]?.displayName).toBe('Sandbox')
    expect(w.activityLog).toEqual([])
  })

  it('check is Review + create: it reports a refusal without changing the world', () => {
    const st = store()
    const before = st.getState().world
    const bad = { type: 'arm/resourceGroups/write', payload: { subscriptionId: SANDBOX_SUBSCRIPTION.subscriptionId, name: 'bad.', location: 'westeurope' } }
    expect(st.getState().check(bad)).toMatchObject({ kind: 'rule', ruleId: 'NAME-1' })
    expect(st.getState().check({ ...bad, payload: { ...bad.payload, name: 'rg-ok' } })).toBeNull()
    expect(st.getState().world).toBe(before)
  })

  it('dispatches Azure writes with the player as caller', () => {
    const st = store()
    const outcome = st.getState().dispatch({ type: 'arm/resourceGroups/write', payload: { subscriptionId: SANDBOX_SUBSCRIPTION.subscriptionId, name: 'rg-ok', location: 'westeurope' } })
    expect(outcome.status).toBe('accepted')
    expect(st.getState().world.activityLog.at(-1)?.caller).toBe(PLAYER_PRINCIPAL)
  })

  it('opening the create panel clears the selection, and selecting closes the panel', () => {
    const st = store()
    st.getState().select('/subscriptions/x/resourceGroups/rg')
    st.getState().startCreate({ kind: 'subnet' })
    expect(st.getState().session.ui).toMatchObject({ selectedId: null, creating: { kind: 'subnet' } })
    st.getState().select('/subscriptions/x/resourceGroups/rg')
    expect(st.getState().session.ui).toMatchObject({ selectedId: '/subscriptions/x/resourceGroups/rg', creating: null })
  })
})
