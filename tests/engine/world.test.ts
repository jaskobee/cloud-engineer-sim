import { describe, expect, it } from 'vitest'
import { createWorld, WORLD_SCHEMA_VERSION } from '../../src/engine/index.ts'

describe('createWorld', () => {
  const world = createWorld({ seed: 'pixelforge', epochMs: 1_790_000_000_000 })

  it('starts at sim time 0, running at 1×, on the current schema version', () => {
    expect(world.schemaVersion).toBe(WORLD_SCHEMA_VERSION)
    expect(world.clock).toEqual({ now: 0, epochMs: 1_790_000_000_000, speed: 1, paused: false })
  })

  it('starts empty: no desired resources, no runtime state, no evidence', () => {
    expect(world.tenant).toEqual({ subscriptions: {}, resourceGroups: {}, resources: {} })
    expect(world.deployments).toEqual({})
    expect(world.runtime).toEqual({})
    expect(world.activityLog).toEqual([])
    expect(world.telemetry.availability.items).toEqual([])
    expect(world.telemetry.metrics).toEqual({})
    expect(world.alerts).toEqual({ fired: [] })
  })

  it('keeps the seed and the RNG streams in the world', () => {
    expect(world.rng.seed).toBe('pixelforge')
    expect(createWorld({ seed: 'pixelforge', epochMs: 0 }).rng).toEqual(world.rng)
    expect(createWorld({ seed: 'other', epochMs: 0 }).rng).not.toEqual(world.rng)
  })

  it('is plain JSON data (nothing is lost by a JSON round trip)', () => {
    expect(JSON.parse(JSON.stringify(world))).toEqual(world)
  })
})
