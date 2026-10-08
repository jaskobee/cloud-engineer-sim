import { describe, expect, it } from 'vitest'
import {
  createRegistry,
  createWorld,
  dispatch,
  dryRun,
  step,
  type Command,
  type CommandHandler,
  type World,
} from '../../src/engine/index.ts'
import { deepFreeze } from '../support/freeze.ts'

const PLAYER = 'player@pixelforge.example'
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** A test-only resource type. Real Azure handlers arrive in step 4, each citing AZURE_FACTS. */
const thingId = (name: string) => `/subscriptions/sub-1/resourceGroups/rg-test/providers/Test.Provider/things/${name}`
const createThing: CommandHandler<{ name: string }> = {
  type: 'test/createThing',
  write: cmd => ({
    operationName: 'Test.Provider/things/write',
    resourceId: thingId(cmd.payload.name),
    subscriptionId: 'sub-1',
    resourceGroupName: 'rg-test',
  }),
  validate(world, cmd) {
    if (cmd.payload.name === '') return { kind: 'rule', ruleId: 'TEST-1', message: 'A name is required.' }
    if (world.tenant.resources[thingId(cmd.payload.name)]) return { kind: 'rule', ruleId: 'TEST-2', message: 'Already exists.' }
    return null
  },
  apply(world, cmd) {
    const id = thingId(cmd.payload.name)
    return {
      ...world,
      tenant: {
        ...world.tenant,
        resources: {
          ...world.tenant.resources,
          [id]: {
            id, type: 'Test.Provider/things', name: cmd.payload.name, location: 'westeurope', tags: {},
            properties: {}, provisioningState: 'Succeeded', createdBy: cmd.caller, changedAt: world.clock.now,
          },
        },
      },
    }
  },
}

const registry = createRegistry([createThing])
const fresh = () => step(createWorld({ seed: 'commands', epochMs: 0 }), 4_000)
const make = (name: string, caller = PLAYER): Command<{ name: string }> => ({ type: 'test/createThing', caller, payload: { name } })

describe('dispatch: accepted control-plane write', () => {
  const before = fresh()
  const { world, outcome } = dispatch(before, registry, make('alpha'))

  it('applies the change to desired state', () => {
    expect(outcome.status).toBe('accepted')
    expect(world.tenant.resources[thingId('alpha')]?.createdBy).toBe(PLAYER)
  })

  it('records Started then Succeeded in the activity log for the same operation (MON-8, MON-10s)', () => {
    const [started, done] = world.activityLog
    expect(world.activityLog).toHaveLength(2)
    expect(started).toMatchObject({ status: 'Started', category: 'Administrative', caller: PLAYER,
      operationName: 'Test.Provider/things/write', resourceId: thingId('alpha'), subscriptionId: 'sub-1',
      resourceGroupName: 'rg-test', eventTimestamp: 4_000 })
    expect(done).toMatchObject({ status: 'Succeeded', eventTimestamp: 4_000 })
    expect(done?.operationId).toBe(started?.operationId)
    expect(done?.correlationId).toBe(started?.correlationId)
    expect(done?.eventDataId).not.toBe(started?.eventDataId)
    for (const e of world.activityLog) {
      expect(e.eventDataId).toMatch(GUID)
      expect(e.operationId).toMatch(GUID)
      expect(e.correlationId).toMatch(GUID)
    }
    if (outcome.status === 'accepted') expect(outcome.operationId).toBe(started?.operationId)
  })

  it('uses the correlation ID the command carries, so a deployment can group its operations', () => {
    const r = dispatch(before, registry, { ...make('beta'), correlationId: 'deploy-123' })
    expect(r.world.activityLog.map(e => e.correlationId)).toEqual(['deploy-123', 'deploy-123'])
  })

  it('does not consume the gameplay RNG stream', () => {
    expect(world.rng.game).toEqual(before.rng.game)
  })
})

describe('dispatch: refused control-plane write', () => {
  const before = fresh()
  const { world, outcome } = dispatch(before, registry, make(''))

  it('returns the refusal with the rule ID and leaves desired state unchanged', () => {
    expect(outcome).toMatchObject({ status: 'refused', refusal: { kind: 'rule', ruleId: 'TEST-1' } })
    expect(world.tenant).toEqual(before.tenant)
  })

  it('records Started then Failed, with the refusal on the Failed entry (MON-8, MON-10s)', () => {
    expect(world.activityLog.map(e => e.status)).toEqual(['Started', 'Failed'])
    expect(world.activityLog[1]?.refusal).toEqual({ kind: 'rule', ruleId: 'TEST-1', message: 'A name is required.' })
  })
})

describe('dispatch: commands that are not control-plane writes', () => {
  it('refuses an unknown command type without logging anything', () => {
    const before = fresh()
    const { world, outcome } = dispatch(before, registry, { type: 'nope', caller: PLAYER, payload: null })
    expect(outcome).toMatchObject({ status: 'refused', refusal: { kind: 'invalid', code: 'engine/unknown-command' } })
    expect(world).toBe(before)
  })

  it('refuses a command without a caller, because every write needs "Event initiated by" (MON-9)', () => {
    const before = fresh()
    const { world, outcome } = dispatch(before, registry, make('gamma', ''))
    expect(outcome).toMatchObject({ status: 'refused', refusal: { kind: 'invalid', code: 'engine/missing-caller' } })
    expect(world).toBe(before)
  })

  it('handles the built-in sim controls without an activity log entry', () => {
    const before = fresh()
    const fast = dispatch(before, registry, { type: 'sim/setSpeed', caller: PLAYER, payload: { speed: 16 } })
    expect(fast.world.clock.speed).toBe(16)
    const paused = dispatch(fast.world, registry, { type: 'sim/setPaused', caller: PLAYER, payload: { paused: true } })
    expect(paused.world.clock.paused).toBe(true)
    expect(paused.world.activityLog).toEqual([])
  })

  it('refuses a clock speed the game does not offer', () => {
    const r = dispatch(fresh(), registry, { type: 'sim/setSpeed', caller: PLAYER, payload: { speed: 3 } })
    expect(r.outcome).toMatchObject({ status: 'refused', refusal: { kind: 'invalid', code: 'sim/invalid-speed' } })
  })
})

describe('dryRun: Review + create', () => {
  it('reports what dispatch would refuse, and never changes the world (MON-11u)', () => {
    const w = deepFreeze(fresh())
    expect(dryRun(w, registry, make(''))).toMatchObject({ kind: 'rule', ruleId: 'TEST-1' })
    expect(dryRun(w, registry, make('delta'))).toBeNull()
    expect(w.activityLog).toEqual([])
  })
})

describe('the pipeline is pure and deterministic', () => {
  it('never mutates the world it was given', () => {
    const w = deepFreeze(fresh())
    expect(() => dispatch(w, registry, make('alpha'))).not.toThrow()
    expect(() => dispatch(w, registry, make(''))).not.toThrow()
  })

  it('replaying the same commands and time from the same seed gives an identical world', () => {
    const play = (): World => {
      let w = fresh()
      w = dispatch(w, registry, make('one')).world
      w = step(w, 2_500)
      w = dispatch(w, registry, make('')).world
      w = dispatch(w, registry, make('two')).world
      return w
    }
    expect(play()).toEqual(play())
  })

  it('refuses to build a registry with two handlers for the same command type', () => {
    expect(() => createRegistry([createThing, createThing])).toThrow(/test\/createThing/)
    expect(() => createRegistry([{ ...createThing, type: 'sim/setSpeed' }])).toThrow(/sim\/setSpeed/)
  })
})
