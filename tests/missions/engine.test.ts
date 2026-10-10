import { describe, expect, it } from 'vitest'
import { azure, dispatch, step, type World } from '../../src/engine/index.ts'
import { registryFor, startMission, systemsFor, type MissionDef } from '../../src/missions/index.ts'

/** A toy mission that exercises the stage machine without any Azure design. */
const SUB = '00000000-0000-4000-8000-000000000001'
const RG_ID = azure.resourceGroupId(SUB, 'rg-target')
let gate = false

const TOY: MissionDef = {
  id: 'toy', title: 'Toy', startsAt: 0, subscription: { subscriptionId: SUB, displayName: 'Toy' },
  client: { name: 'Toy', industry: '', size: '', situation: '', goal: '', constraints: '' },
  actors: [{ id: 'npc', displayName: 'NPC', role: 'Tester', principalName: 'npc@toy.example' }],
  ticket: { from: 'npc', body: 'Hello' },
  setup: () => [],
  objectives: [{ id: 'rg', title: 'A resource group exists', technical: '', rules: ['RG-1'], hints: [], check: w => ({ ok: !!w.tenant.resourceGroups[RG_ID.toLowerCase()], detail: '' }) }],
  stages: [
    { id: 'one', title: '', goal: '', objectives: ['rg'], triggers: [], completeWhen: w => !!w.tenant.resourceGroups[RG_ID.toLowerCase()] },
    {
      id: 'two', title: '', goal: '', objectives: [],
      triggers: [
        // Not possible until the gate opens: retried every tick, fired once.
        { id: 'npc-write', effects: [{ kind: 'command', command: () => (gate ? { type: 'arm/resourceGroups/write', caller: 'npc@toy.example', payload: { subscriptionId: SUB, name: 'rg-npc', location: 'westeurope' } } : null) }, { kind: 'message', message: { from: 'npc', body: 'Done' } }] },
      ],
      completeWhen: (_w, ctx) => ctx.firedAt('npc-write') !== undefined,
    },
    { id: 'end', title: '', goal: '', objectives: [], triggers: [{ id: 'bye', effects: [{ kind: 'message', message: { from: 'npc', body: 'Bye' } }] }] },
  ],
  report: { rootCauses: [], evidence: [], lessons: [], minEvidence: 0 },
  certifications: [],
}

const registry = registryFor(TOY)
const systems = systemsFor(TOY, registry)
const run = (w: World, ms: number) => step(w, ms, systems)

describe('mission engine', () => {
  it('moves through stages, retries triggers that can\'t run yet, fires each once, and marks completion', () => {
    gate = false
    let w = startMission(TOY, 'toy', registry)
    expect(w.mission).toMatchObject({ stage: 'one', fired: {} })
    w = run(w, 5_000)
    expect(w.mission?.stage).toBe('one')

    w = dispatch(w, registry, { type: 'arm/resourceGroups/write', caller: 'player@toy.example', payload: { subscriptionId: SUB, name: 'rg-target', location: 'westeurope' } }).world
    w = run(w, 1_000)
    expect(w.mission?.stage).toBe('two')

    w = run(w, 5_000)
    expect(w.mission?.fired).toEqual({})
    gate = true
    w = run(w, 1_000)
    expect(Object.keys(w.mission?.fired ?? {})).toEqual(['two/npc-write'])
    expect(w.activityLog.filter(e => e.caller === 'npc@toy.example')).toHaveLength(2)
    expect(w.mission?.messages.map(m => m.body)).toEqual(['Hello', 'Done'])
    // The stage's condition is checked after its triggers, in the same tick.
    expect(w.mission).toMatchObject({ stage: 'end' })
    expect(w.mission?.completedAt).toBe(w.clock.now)
    w = run(w, 3_000)
    // Triggers of the last stage still fire after completion, once.
    expect(w.mission?.messages.map(m => m.body)).toEqual(['Hello', 'Done', 'Bye'])
    expect(w.tenant.resourceGroups[azure.resourceGroupId(SUB, 'rg-npc').toLowerCase()]).toBeDefined()
  })

  it('only one mission per world', () => {
    const w = startMission(TOY, 'toy', registry)
    expect(dispatch(w, registry, { type: 'mission/start', caller: 'scenario', payload: { missionId: 'toy' } }).outcome).toMatchObject({ status: 'refused', refusal: { code: 'mission/already-running' } })
  })
})
