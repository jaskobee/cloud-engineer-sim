import { describe, expect, it } from 'vitest'
import type { World } from '../../src/engine/index.ts'
import {
  emptyProfile, levelFor, missionResult, MODE_MULTIPLIER, recordRun, reviewMission, runIdOf, startMission, XP, xpForLevel,
} from '../../src/missions/index.ts'
import { act, begin, build, INTENDED, MISSION, registry, run, runUntil, stage } from './play.ts'

const CORRECT = { rootCause: 'deny-priority', evidence: ['activity-log', 'ip-flow-verify'], lesson: 'default-deny' }

/** Play the mission to the end: fix by deleting Jonas's rule (or `fix`), then send the note(s). */
function finish(world: World, gameNsg: string, opts: { fix?: 'delete' | 'move'; wrongFirst?: boolean } = {}): World {
  let w = runUntil(world, x => stage(x) === 'incident', 20, 'incident')
  w = runUntil(w, x => x.alerts.fired.length > 0, 10, 'alert')
  const rule = `${gameNsg}/securityRules/Deny-Internet-Inbound`
  if (opts.fix === 'move') {
    w = act(w, 'arm/securityRules/write', {
      networkSecurityGroupId: gameNsg, name: 'Deny-Internet-Inbound',
      properties: { priority: 4000, direction: 'Inbound', access: 'Deny', protocol: '*', sourceAddressPrefix: 'Internet', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '*' },
    })
  } else {
    w = act(w, 'arm/securityRules/delete', { securityRuleId: rule })
  }
  w = runUntil(w, x => stage(x) === 'report', 15, 'report')
  if (opts.wrongFirst) w = act(w, 'mission/submitReport', { ...CORRECT, rootCause: 'vm-stopped' })
  w = act(w, 'mission/submitReport', CORRECT)
  return run(w, 2_000)
}

describe('progression (step 11, MVP §31–32)', () => {
  it('no result before the mission is complete', () => {
    expect(missionResult(MISSION, begin())).toBeNull()
  })

  it('a clean Guided run: every review item passes, all three badges, XP from the formula', () => {
    const { world, gameNsg } = build(begin(), INTENDED)
    const w = finish(world, gameNsg)
    expect(stage(w)).toBe('complete')
    const result = missionResult(MISSION, w)!
    expect(result.review.map(d => [d.dimension, d.score])).toEqual([['Security', 100], ['Reliability', 100], ['Observability', 100]])
    expect(result.badges).toEqual(['first-azure-deployment', 'networking-foundations', 'incident-resolver'])
    expect(result.xp.total).toBe(XP.missionComplete + MISSION.review.length * XP.reviewItem + XP.noteFirstTime)
  })

  it('the review explains what a weaker fix misses: moving Jonas\'s rule leaves a redundant deny', () => {
    const { world, gameNsg } = build(begin(), INTENDED)
    const w = finish(world, gameNsg, { fix: 'move', wrongFirst: true })
    const security = reviewMission(MISSION, w).find(d => d.dimension === 'Security')!
    expect(security.items.find(i => i.id === 'no-redundant-deny')).toMatchObject({ ok: false, rules: ['NSG-3', 'NSG-1'] })
    const result = missionResult(MISSION, w)!
    expect(result.badges).toEqual(['first-azure-deployment'])
    expect(result.xp.lines.map(l => l.label)).toContain('Incident note right after 2 tries')
  })

  it('Expert multiplies XP and charges for hints', () => {
    let start = startMission(MISSION, 'mission-test', registry, 'expert')
    start = act(start, 'mission/revealHint', { key: 'players-https' })
    const { world, gameNsg } = build(start, INTENDED)
    const result = missionResult(MISSION, finish(world, gameNsg))!
    expect(result.xp.multiplier).toBe(MODE_MULTIPLIER.expert)
    expect(result.xp.lines.at(-1)).toEqual({ label: '1 hint in Expert mode', xp: -XP.expertHint })
    const base = XP.missionComplete + MISSION.review.length * XP.reviewItem + XP.noteFirstTime - XP.expertHint
    expect(result.xp.total).toBe(Math.round(base * 1.5))
  })

  it('levels and titles follow MVP §31; a run counts once in the profile', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, title: 'Cloud Beginner', next: 100 })
    expect(levelFor(xpForLevel(5))).toMatchObject({ level: 5, title: 'Junior Cloud Engineer' })
    expect(levelFor(xpForLevel(12))).toMatchObject({ level: 12, title: 'Cloud Engineer' })
    expect(levelFor(xpForLevel(30))).toMatchObject({ title: 'Cloud Architect' })
    const id = runIdOf(begin())!
    const once = recordRun(emptyProfile(), id, { missionId: MISSION.id, mode: 'guided', xp: 1050, badges: ['first-azure-deployment'] })
    expect(recordRun(once, id, { missionId: MISSION.id, mode: 'guided', xp: 1050, badges: [] })).toBe(once)
    expect(once).toMatchObject({ xp: 1050, badges: ['first-azure-deployment'] })
  })
})
