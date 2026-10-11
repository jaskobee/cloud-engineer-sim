import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { azure } from '../../src/engine/index.ts'
import { resolvePath } from '../../src/ui/portal/guide.ts'
import { resolveSection } from '../../src/ui/portal/menus.ts'
import { SERVICES } from '../../src/ui/portal/services.ts'
import { factIds } from '../support/facts.ts'
import { ALTERNATIVE, begin, build, INTENDED, MISSION } from './play.ts'

const FACTS = factIds(readFileSync(path.resolve(import.meta.dirname, '../../Docs/AZURE_FACTS.md'), 'utf8'))
const allPaths = () => [
  ...MISSION.objectives.map(o => [o.id, o.portalPath ?? []] as const),
  ...MISSION.stages.filter(s => s.portalPath).map(s => [`stage ${s.id}`, s.portalPath ?? []] as const),
  ...(MISSION.buildPlan?.steps ?? []).map(s => [`plan ${s.id}`, s.portalPath] as const),
]

describe('Guided portal paths (D-7, PORTAL rules)', () => {
  it('every objective has a path, and every step cites a PORTAL rule in the register', () => {
    for (const o of MISSION.objectives) expect(o.portalPath?.length, o.id).toBeGreaterThan(0)
    for (const [owner, steps] of allPaths()) {
      for (const s of steps) {
        expect(s.rule, `${owner}: ${s.label}`).toMatch(/^PORTAL-\d+s?$/)
        expect(FACTS.has(s.rule), `${owner}: ${s.label} → ${s.rule}`).toBe(true)
        const t = s.target
        if (t.kind === 'service') expect(SERVICES.some(x => x.id === t.id) || t.id === 'createResource', `${owner}: ${t.id}`).toBe(true)
        if (t.kind === 'resource') expect(MISSION.roles?.[t.role], `${owner}: role ${t.role}`).toBeDefined()
      }
    }
  })

  it('unresolved target renders as text: roles with no resource yet have no route', () => {
    const w = begin()
    const steps = resolvePath(MISSION.objectives.find(o => o.id === 'db-only-game')!.portalPath!, MISSION, w)
    expect(steps[0]?.route).toEqual({ page: 'browse', type: azure.NSG_TYPE.toLowerCase() })
    expect(steps[1]?.route).toBeNull()
    expect(steps[1]?.label).toBeTruthy()
  })

  it('once a design is built, every resource step resolves to a section its menu lists (both designs)', () => {
    for (const design of [INTENDED, ALTERNATIVE]) {
      const w = build(begin(), design).world
      for (const [owner, steps] of allPaths()) {
        for (const s of resolvePath(steps, MISSION, w)) {
          if (s.kind === 'anchor') continue
          expect(s.route, `${owner}: ${s.label}`).not.toBeNull()
          if (s.route?.page === 'resource') {
            const type = azure.parseArmId(s.route.id)?.type ?? 'resourcegroup'
            expect(resolveSection(type, s.route.section), `${owner}: ${s.label}`).toBe(s.route.section)
          }
        }
      }
    }
  })
})
