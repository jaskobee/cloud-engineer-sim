import { describe, expect, it } from 'vitest'
import { azure, dispatch } from '../../../src/engine/index.ts'
import { emptyWorld, expectRule, lastWrite, ok, PLAYER, refused, registry, RG, rgId, SUB } from './fixtures.ts'

const create = (name: string, location = 'westeurope') => ({ subscriptionId: SUB, name, location })

describe('scenario: subscriptions', () => {
  it('adds a client subscription without an activity log entry (not an Azure write)', () => {
    const w = emptyWorld()
    expect(w.tenant.subscriptions[SUB]?.displayName).toBe('PixelForge Production')
    expect(w.activityLog).toEqual([])
  })

  it('refuses a malformed or duplicate subscription', () => {
    expect(refused(emptyWorld(), 'scenario/addSubscription', { subscriptionId: 'not-a-guid', displayName: 'x' }).kind).toBe('invalid')
    expect(refused(emptyWorld(), 'scenario/addSubscription', { subscriptionId: SUB, displayName: 'again' }).kind).toBe('invalid')
  })
})

describe('resource groups', () => {
  it('creates a resource group and logs the write as Microsoft.Resources/subscriptions/resourceGroups/write (RG-3)', () => {
    const w = ok(emptyWorld(), 'arm/resourceGroups/write', create(RG))
    expect(azure.getResourceGroup(w, rgId())).toEqual({ id: rgId(), name: RG, location: 'westeurope', tags: {} })
    expect(lastWrite(w).map(e => [e.status, e.operationName, e.resourceId, e.caller])).toEqual([
      ['Started', 'Microsoft.Resources/subscriptions/resourceGroups/write', rgId(), PLAYER],
      ['Succeeded', 'Microsoft.Resources/subscriptions/resourceGroups/write', rgId(), PLAYER],
    ])
  })

  it('accepts names with Unicode letters, digits, underscores, hyphens, periods and parentheses (NAME-1, NAME-8)', () => {
    for (const name of ['rg-münchen', 'RG_(prod).v2', 'a', 'x'.repeat(90)]) ok(emptyWorld(), 'arm/resourceGroups/write', create(name))
  })

  it('refuses invalid names (NAME-1)', () => {
    for (const name of ['', 'rg-prod.', 'rg prod', 'rg/prod', 'rg!', 'x'.repeat(91)]) {
      expectRule(refused(emptyWorld(), 'arm/resourceGroups/write', create(name)), 'NAME-1')
    }
  })

  it('only offers the modelled regions (REG-1)', () => {
    expectRule(refused(emptyWorld(), 'arm/resourceGroups/write', create(RG, 'eastus')), 'REG-1', 'not-modelled')
  })

  it('treats names case-insensitively, and an existing group is not updated (NAME-6, RG-2u)', () => {
    const w = ok(emptyWorld(), 'arm/resourceGroups/write', create(RG))
    expectRule(refused(w, 'arm/resourceGroups/write', create(RG.toUpperCase(), 'northeurope')), 'RG-2u', 'not-modelled')
  })

  it('records a refused write as Started + Failed with the refusal (MON-10s)', () => {
    const { world, outcome } = dispatch(emptyWorld(), registry, { type: 'arm/resourceGroups/write', caller: PLAYER, payload: create('bad.') })
    expect(outcome.status).toBe('refused')
    expect(lastWrite(world).map(e => [e.status, e.refusal?.kind === 'rule' ? e.refusal.ruleId : null])).toEqual([
      ['Started', null],
      ['Failed', 'NAME-1'],
    ])
  })

  it('needs an existing subscription', () => {
    expect(refused(emptyWorld(), 'arm/resourceGroups/write', { ...create(RG), subscriptionId: '00000000-0000-4000-8000-000000000000' }).kind).toBe('invalid')
  })
})
