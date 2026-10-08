import { describe, expect, it } from 'vitest'
import { WORLD_SCHEMA_VERSION, createRegistry, createWorld, dispatch, loadWorld, saveWorld, step } from '../../src/engine/index.ts'

const registry = createRegistry([])
const played = () => {
  let w = createWorld({ seed: 'save', epochMs: 1_790_000_000_000 })
  w = step(w, 12_345)
  w = dispatch(w, registry, { type: 'sim/setSpeed', caller: 'player@pixelforge.example', payload: { speed: 4 } }).world
  return w
}

describe('save/load v1', () => {
  it('round-trips a world exactly', () => {
    const w = played()
    const loaded = loadWorld(saveWorld(w))
    expect(loaded).toEqual({ ok: true, world: w })
  })

  it('writes the schema version into the save', () => {
    expect(JSON.parse(saveWorld(played()))).toMatchObject({ schemaVersion: WORLD_SCHEMA_VERSION })
  })

  it('a loaded world continues exactly like the original', () => {
    const w = played()
    const loaded = loadWorld(saveWorld(w))
    if (!loaded.ok) throw new Error(loaded.message)
    expect(step(loaded.world, 60_000)).toEqual(step(w, 60_000))
  })

  it('refuses text that is not JSON', () => {
    expect(loadWorld('{not json')).toMatchObject({ ok: false, reason: 'invalid-json' })
  })

  it('refuses JSON that is not a world', () => {
    expect(loadWorld('[]')).toMatchObject({ ok: false, reason: 'not-a-world' })
    expect(loadWorld('{"hello":"world"}')).toMatchObject({ ok: false, reason: 'not-a-world' })
    const broken = { ...JSON.parse(saveWorld(played())), clock: { now: 'soon' } }
    expect(loadWorld(JSON.stringify(broken))).toMatchObject({ ok: false, reason: 'not-a-world' })
  })

  it('refuses a save from a newer version of the game', () => {
    const newer = { ...JSON.parse(saveWorld(played())), schemaVersion: WORLD_SCHEMA_VERSION + 1 }
    expect(loadWorld(JSON.stringify(newer))).toMatchObject({ ok: false, reason: 'unsupported-version' })
  })
})
