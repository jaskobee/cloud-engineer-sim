import { describe, expect, it } from 'vitest'
import { createGameStore, newWorld } from '../../src/store/gameStore.ts'
import { startTickLoop, type FrameScheduler } from '../../src/store/tickLoop.ts'

/** A scheduler the test drives frame by frame. */
function fakeScheduler() {
  let pending: ((t: number) => void) | null = null
  let cancelled = 0
  const scheduler: FrameScheduler = {
    request(cb) {
      pending = cb
      return 1
    },
    cancel() {
      pending = null
      cancelled++
    },
  }
  const frame = (t: number) => {
    const cb = pending
    pending = null
    cb?.(t)
  }
  return { scheduler, frame, isScheduled: () => pending !== null, cancelled: () => cancelled }
}

const setup = (options = {}) => {
  const store = createGameStore({ world: newWorld('loop') })
  const fake = fakeScheduler()
  let saves = 0
  const stop = startTickLoop(store, fake.scheduler, { onAutosave: () => saves++, ...options })
  return { store, fake, stop, saves: () => saves }
}

describe('tick loop', () => {
  it('commits real time to the store in batches, not every frame', () => {
    const { store, fake } = setup({ commitEveryMs: 100 })
    let commits = 0
    store.subscribe(() => commits++)
    for (let i = 0; i <= 12; i++) fake.frame(i * 16) // 12 frame intervals = 192 ms
    expect(commits).toBe(1)
    expect(store.getState().world.clock.now).toBe(112) // first commit once ≥ 100 ms had accumulated
  })

  it('does not let a long gap (hidden tab, sleep) fast-forward the simulation', () => {
    const { store, fake } = setup({ commitEveryMs: 100, maxFrameMs: 250 })
    fake.frame(0)
    fake.frame(60_000)
    expect(store.getState().world.clock.now).toBe(250)
  })

  it('applies the clock speed through the engine', () => {
    const { store, fake } = setup({ commitEveryMs: 100 })
    store.getState().dispatch({ type: 'sim/setSpeed', payload: { speed: 4 } })
    fake.frame(0)
    fake.frame(100)
    expect(store.getState().world.clock.now).toBe(400)
  })

  it('autosaves on a real-time interval', () => {
    const { fake, saves } = setup({ autosaveEveryMs: 1_000, maxFrameMs: 250 })
    for (let t = 0; t <= 2_000; t += 200) fake.frame(t)
    expect(saves()).toBe(2)
  })

  it('stops cleanly: cancels the pending frame and ticks no more', () => {
    const { store, fake, stop } = setup({ commitEveryMs: 100 })
    fake.frame(0)
    stop()
    expect(fake.cancelled()).toBe(1)
    expect(fake.isScheduled()).toBe(false)
    fake.frame(500)
    expect(store.getState().world.clock.now).toBe(0)
  })
})
