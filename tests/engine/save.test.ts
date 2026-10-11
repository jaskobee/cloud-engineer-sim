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

describe('migrations', () => {
  it('v1 → v2: a deployment with one `operation` becomes one with `operations`, and still completes (ARM-15s)', async () => {
    const { hasRunningDeployments, TICK_MS } = await import('../../src/engine/index.ts')
    const { emptyWorld, ok, start, SUB, RG } = await import('./azure/fixtures.ts')
    const w = start(ok(emptyWorld(), 'arm/resourceGroups/write', { subscriptionId: SUB, name: RG, location: 'westeurope' }), 'arm/virtualNetworks/write', {
      subscriptionId: SUB, resourceGroupName: RG, name: 'vnet-old', location: 'westeurope', addressPrefixes: ['10.40.0.0/16'],
    })
    // Rewrite the save the way schema v1 stored it.
    const v2 = JSON.parse(saveWorld(w)) as Record<string, unknown> & { deployments: Record<string, Record<string, unknown>> }
    const v1Deployments = Object.fromEntries(Object.entries(v2.deployments).map(([id, d]) => {
      const { operations, ...rest } = d as { operations: Record<string, unknown>[] } & Record<string, unknown>
      const op = operations[0]!
      const operation = Object.fromEntries(Object.entries(op).filter(([k]) => !['startsAt', 'endsAt', 'startedEventDataId', 'finishedEventDataId', 'completedAt'].includes(k)))
      return [id, { ...rest, operation, finishedEventDataId: op['finishedEventDataId'] }]
    }))
    const loaded = loadWorld(JSON.stringify({ ...v2, schemaVersion: 1, deployments: v1Deployments }))
    if (!loaded.ok) throw new Error(loaded.message)
    const d = Object.values(loaded.world.deployments)[0]!
    expect(d.operations).toHaveLength(1)
    expect(d.operations[0]).toMatchObject({ startsAt: d.startedAt, endsAt: d.endsAt, finishedEventDataId: Object.values(w.deployments)[0]!.operations[0]!.finishedEventDataId })
    let after = loaded.world
    while (hasRunningDeployments(after)) after = step(after, TICK_MS)
    expect(Object.values(after.deployments)[0]?.provisioningState).toBe('Succeeded')
    expect(after.activityLog.at(-1)).toMatchObject({ status: 'Succeeded', operationName: 'Microsoft.Network/virtualNetworks/write' })
  })
})
