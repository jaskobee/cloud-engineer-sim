import type { AssistanceMode, World } from '../engine/index.ts'
import { hintsUsed, judgeReport } from './engine.ts'
import type { MissionDef, ReviewDimension } from './types.ts'

/**
 * Progression (step 11, MVP §11 and §31–32): the architecture review, XP and badges of a finished
 * mission are derived from the world; only the player's profile (across missions) is stored, outside
 * the world. All numbers here are game design, not Azure behaviour (decision D-6).
 */

export const XP = {
  missionComplete: 500,
  reviewItem: 50,
  noteFirstTime: 100,
  noteLater: 50,
  /** Expert mode only: each hint opened costs this much. */
  expertHint: 25,
} as const

export const MODE_MULTIPLIER: Record<AssistanceMode, number> = { guided: 1, standard: 1.2, expert: 1.5 }

export interface ReviewResult {
  dimension: ReviewDimension
  /** Share of passed items, 0–100. */
  score: number
  items: { id: string; title: string; ok: boolean; why: string; rules: readonly string[] }[]
}

export interface MissionResult {
  review: ReviewResult[]
  xp: { lines: { label: string; xp: number }[]; multiplier: number; total: number }
  badges: string[]
}

export function reviewMission(def: MissionDef, world: World): ReviewResult[] {
  const dimensions = [...new Set(def.review.map(r => r.dimension))]
  return dimensions.map(dimension => {
    const items = def.review.filter(r => r.dimension === dimension).map(r => ({ id: r.id, title: r.title, ok: r.check(world), why: r.why, rules: r.rules }))
    return { dimension, items, score: Math.round((100 * items.filter(i => i.ok).length) / Math.max(items.length, 1)) }
  })
}

/** The result of a finished mission. Null while it isn't finished. */
export function missionResult(def: MissionDef, world: World): MissionResult | null {
  const mission = world.mission
  if (mission?.id !== def.id || mission.completedAt === undefined) return null
  const review = reviewMission(def, world)
  const passed = new Set(review.flatMap(d => d.items.filter(i => i.ok).map(i => i.id)))
  const lines: { label: string; xp: number }[] = [{ label: 'Mission complete', xp: XP.missionComplete }]
  lines.push({ label: `Architecture review: ${passed.size} of ${def.review.length} items`, xp: passed.size * XP.reviewItem })
  if (judgeReport(def.report, mission.report).correct) {
    lines.push(mission.reportAttempts <= 1
      ? { label: 'Incident note right first time', xp: XP.noteFirstTime }
      : { label: `Incident note right after ${mission.reportAttempts} tries`, xp: XP.noteLater })
  }
  const hints = hintsUsed(world)
  if (mission.mode === 'expert' && hints > 0) lines.push({ label: `${hints} hint${hints === 1 ? '' : 's'} in Expert mode`, xp: -hints * XP.expertHint })
  const multiplier = MODE_MULTIPLIER[mission.mode]
  const total = Math.max(0, Math.round(lines.reduce((n, l) => n + l.xp, 0) * multiplier))
  return { review, xp: { lines, multiplier, total }, badges: def.badges.filter(b => b.earned(world, passed)).map(b => b.id) }
}

// ── Career (MVP §11, §31) ──────────────────────────────────────────────────────────────────────

/** Level titles from MVP §31; a level keeps the title of the last one at or below it. */
export const LEVEL_TITLES: readonly [number, string][] = [
  [1, 'Cloud Beginner'], [5, 'Junior Cloud Engineer'], [10, 'Cloud Engineer'], [20, 'Senior Cloud Engineer'], [30, 'Cloud Architect'],
]

/** XP needed to reach a level: 100 × (level − 1)². */
export const xpForLevel = (level: number): number => 100 * (level - 1) ** 2

export function levelFor(xp: number): { level: number; title: string; next: number } {
  let level = 1
  while (xp >= xpForLevel(level + 1)) level++
  const title = [...LEVEL_TITLES].reverse().find(([l]) => l <= level)?.[1] ?? 'Cloud Beginner'
  return { level, title, next: xpForLevel(level + 1) }
}

export interface ProfileRun {
  missionId: string
  mode: AssistanceMode
  xp: number
  badges: string[]
}

/** The player's career across missions. Kept outside the world (one browser profile). */
export interface Profile {
  version: 1
  xp: number
  badges: string[]
  /** Run ID (mission + world seed) → result, so a finished run counts once. */
  runs: Record<string, ProfileRun>
}

export const emptyProfile = (): Profile => ({ version: 1, xp: 0, badges: [], runs: {} })

export const runIdOf = (world: World): string | null => (world.mission ? `${world.mission.id}:${world.rng.seed}` : null)

/** Add a finished run to the profile; a run already counted changes nothing. */
export function recordRun(profile: Profile, runId: string, run: ProfileRun): Profile {
  if (profile.runs[runId]) return profile
  return {
    ...profile,
    xp: profile.xp + run.xp,
    badges: [...profile.badges, ...run.badges.filter(b => !profile.badges.includes(b))],
    runs: { ...profile.runs, [runId]: run },
  }
}
