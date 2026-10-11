import { describe, expect, it } from 'vitest'
import { nextStepIndex, type ResolvedStep } from '../../src/ui/portal/guide.ts'

const step = (label: string, route: ResolvedStep['route'], kind: ResolvedStep['kind'] = 'service', guide = label): ResolvedStep => ({ label, rule: 'PORTAL-5', route, kind, guide })
const nsgList = { page: 'browse', type: 'microsoft.network/networksecuritygroups' } as const
const nsg = { page: 'resource', id: '/x/nsg', section: 'overview' } as const
const inbound = { page: 'resource', id: '/x/nsg', section: 'inbound' } as const
const steps = [step('Network security groups', nsgList), step('nsg-game', nsg, 'resource'), step('Inbound security rules', inbound, 'section'), step('+ Add', null, 'anchor', 'nsg:inbound:add')]

describe('the next step of a portal path', () => {
  it('starts at the first step, follows the route, and ends on the anchor of the last page', () => {
    expect(nextStepIndex(steps, { page: 'home' })).toBe(0)
    expect(nextStepIndex(steps, nsgList)).toBe(1)
    expect(nextStepIndex(steps, nsg)).toBe(2)
    expect(nextStepIndex(steps, inbound)).toBe(3)
  })

  it('a step the player can already see from later in the path wins (furthest match)', () => {
    expect(nextStepIndex([step('A', nsg, 'resource'), step('B', nsg, 'resource'), step('C', inbound, 'section')], nsg)).toBe(2)
  })
})
