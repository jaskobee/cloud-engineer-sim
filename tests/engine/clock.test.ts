import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_LOG_RETENTION_MS,
  SYSTEMS,
  TICK_MS,
  activityLogRetention,
  advance,
  createWorld,
  step,
  type ActivityLogEntry,
  type System,
  type World,
} from '../../src/engine/index.ts'
import { createRingBuffer, pushRing } from '../../src/engine/ringBuffer.ts'
import { deepFreeze } from '../support/freeze.ts'

const fresh = () => createWorld({ seed: 'clock', epochMs: 0 })

/** A test system that records each tick window as a metric, the way telemetry systems will. */
const recordTicks: System = (world, tick) => {
  const series = world.telemetry.metrics['/test']?.['ticks'] ?? createRingBuffer<[number, number]>(100)
  return {
    ...world,
    telemetry: { ...world.telemetry, metrics: { ...world.telemetry.metrics, '/test': { ticks: pushRing(series, [tick.start, tick.end]) } } },
  }
}
const ticksOf = (w: World) => w.telemetry.metrics['/test']?.['ticks']?.items.map(([s, e]) => `${s}-${e}`) ?? []

describe('step(world, dt)', () => {
  it('advances sim time by dt', () => {
    expect(step(fresh(), 2_500).clock.now).toBe(2_500)
  })

  it(`runs the systems once per completed ${TICK_MS} ms tick, with the tick window`, () => {
    const w = step(fresh(), 3 * TICK_MS + 400, [recordTicks])
    expect(ticksOf(w)).toEqual([`0-${TICK_MS}`, `${TICK_MS}-${2 * TICK_MS}`, `${2 * TICK_MS}-${3 * TICK_MS}`])
  })

  it('gives the same world however the same time span is split into steps', () => {
    const once = step(fresh(), 10_500, [recordTicks])
    const split = step(step(step(fresh(), 3_200, [recordTicks]), 299, [recordTicks]), 7_001, [recordTicks])
    expect(split).toEqual(once)
  })

  it('sees the tick end time as the clock during a tick', () => {
    const seen: number[] = []
    step(fresh(), 2 * TICK_MS, [(w) => { seen.push(w.clock.now); return w }])
    expect(seen).toEqual([TICK_MS, 2 * TICK_MS])
  })

  it('rejects negative or non-finite durations', () => {
    expect(() => step(fresh(), -1)).toThrow(RangeError)
    expect(() => step(fresh(), Number.NaN)).toThrow(RangeError)
    expect(() => step(fresh(), Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it('never mutates the world it was given', () => {
    const w = deepFreeze(fresh())
    expect(() => step(w, 5 * TICK_MS)).not.toThrow()
    expect(w.clock.now).toBe(0)
  })
})

describe('advance(world, realMs): the tick loop entry point', () => {
  it('scales real time by the clock speed', () => {
    const w = { ...fresh(), clock: { ...fresh().clock, speed: 16 as const } }
    expect(advance(w, 1_000).clock.now).toBe(16_000)
  })

  it('does nothing while paused', () => {
    const w = { ...fresh(), clock: { ...fresh().clock, paused: true } }
    expect(advance(w, 1_000)).toBe(w)
  })
})

describe('activity log retention (MON-7, MON-13s)', () => {
  it('drops entries older than 90 sim days and keeps newer ones', () => {
    const entry = (eventDataId: string, eventTimestamp: number): ActivityLogEntry => ({
      eventDataId, operationId: 'op', correlationId: 'c', category: 'Administrative', operationName: 'x/write',
      resourceId: '/r', subscriptionId: 's', caller: 'a@b', status: 'Succeeded', eventTimestamp,
    })
    expect(ACTIVITY_LOG_RETENTION_MS).toBe(90 * 24 * 60 * 60 * 1000)
    // Stepping 90 sim days runs ~7.8 million ticks, so call the system directly at that time.
    const base = fresh()
    const w: World = {
      ...base,
      clock: { ...base.clock, now: ACTIVITY_LOG_RETENTION_MS + TICK_MS },
      activityLog: [entry('old', 0), entry('edge', TICK_MS), entry('new', 5 * TICK_MS)],
    }
    const tick = { start: w.clock.now - TICK_MS, end: w.clock.now }
    expect(activityLogRetention(w, tick).activityLog.map(e => e.eventDataId)).toEqual(['edge', 'new'])
    expect(activityLogRetention(fresh(), tick).activityLog).toEqual([])
  })

  it('runs as part of every step', () => {
    expect(SYSTEMS).toContain(activityLogRetention)
  })
})
