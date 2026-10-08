import { describe, expect, it } from 'vitest'
import { TICK_MS } from '../../src/engine/index.ts'
import { PLAYER_PRINCIPAL, createGameStore, newWorld } from '../../src/store/gameStore.ts'

const store = () => createGameStore({ world: newWorld('store-test') })

describe('game store', () => {
  it('starts on the given world with a default session', () => {
    const s = store().getState()
    expect(s.world.rng.seed).toBe('store-test')
    expect(s.session).toEqual({ missionId: null, mode: 'guided', ui: { bottomTab: 'activity-log', selectedId: null } })
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
