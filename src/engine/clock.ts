import { activityLogRetention } from './activityLog.ts'
import type { World } from './world.ts'

/** Fixed simulation tick. Systems always see whole ticks, however the caller slices time. */
export const TICK_MS = 1000

export interface Tick {
  start: number
  end: number
}

/** One phase of the simulation: a pure function of the world for one tick. */
export type System = (world: World, tick: Tick) => World

/**
 * Systems in the order they run each tick (bootstrap report §F):
 * deployments → runtime → traffic → availability probes → metrics → alerts → mission triggers.
 * Each arrives with its step; housekeeping runs last.
 */
export const SYSTEMS: readonly System[] = [activityLogRetention]

/**
 * Advance sim time by `dt` sim milliseconds. Systems run once for every tick boundary crossed,
 * with the clock set to the tick's end, so `step(step(w, a), b)` equals `step(w, a + b)`.
 */
export function step(world: World, dt: number, systems: readonly System[] = SYSTEMS): World {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError(`step needs a finite, non-negative dt, got ${dt}`)
  const target = world.clock.now + dt
  let w = world
  for (let end = (Math.floor(world.clock.now / TICK_MS) + 1) * TICK_MS; end <= target; end += TICK_MS) {
    w = { ...w, clock: { ...w.clock, now: end } }
    const tick = { start: end - TICK_MS, end }
    for (const system of systems) w = system(w, tick)
  }
  return w.clock.now === target ? w : { ...w, clock: { ...w.clock, now: target } }
}

/** Tick-loop entry point: real elapsed milliseconds, scaled by the clock speed. Paused → unchanged. */
export function advance(world: World, realMs: number): World {
  if (world.clock.paused) return world
  return step(world, realMs * world.clock.speed)
}
