import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { compare, extractUpdated, parseSources, renderReport, rulesCiting, type PageResult } from '../../scripts/learnDrift.ts'

const FACTS = readFileSync(path.resolve(import.meta.dirname, '../../Docs/AZURE_FACTS.md'), 'utf8')

describe('Learn drift check (QA layer 1)', () => {
  it('reads every Learn source from the register', () => {
    const sources = parseSources(FACTS)
    expect(sources.length).toBe(FACTS.split('\n').filter(l => l.startsWith('| L-')).length)
    expect(sources.every(s => s.url.startsWith('https://'))).toBe(true)
    expect(sources.find(s => s.key === 'L-NSG')?.url).toBe('https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview')
  })

  it('finds the last-updated date in Learn page metadata, then in the visible text', () => {
    expect(extractUpdated('<head><meta name="ms.date" content="09/28/2026"><meta name="updated_at" content="2026-09-28T22:09:00Z" /></head>')).toBe('2026-09-28T22:09:00Z')
    expect(extractUpdated('<meta content="2026-08-27" name="ms.date">')).toBe('2026-08-27')
    expect(extractUpdated('<p>Last updated on 2026-07-08</p>')).toBe('2026-07-08')
    expect(extractUpdated('<p>nothing</p>')).toBeNull()
  })

  it('compares with the lock: changed, broken and new pages', () => {
    const lock = { 'https://a': { key: 'L-A', url: 'https://a', updated: '2026-01-01' }, 'https://b': { key: 'L-B', url: 'https://b', updated: '2026-01-01' } }
    const results: PageResult[] = [
      { key: 'L-A', url: 'https://a', ok: true, status: 200, updated: '2026-01-01', finalUrl: 'https://a' },
      { key: 'L-B', url: 'https://b', ok: true, status: 200, updated: '2026-09-01', finalUrl: 'https://b' },
      { key: 'L-C', url: 'https://c', ok: true, status: 200, updated: '2026-02-02', finalUrl: 'https://c' },
      { key: 'L-D', url: 'https://d', ok: false, status: 404, error: 'HTTP 404' },
    ]
    const r = compare(lock, results)
    expect(r.changed).toEqual([{ key: 'L-B', url: 'https://b', was: '2026-01-01', now: '2026-09-01' }])
    expect(r.baseline.map(b => b.key)).toEqual(['L-C'])
    expect(r.broken.map(b => b.key)).toEqual(['L-D'])
    expect(r.lock['https://b']?.updated).toBe('2026-09-01')
  })

  it('names the rules to re-verify when a page changes', () => {
    expect(rulesCiting(FACTS, 'L-NSG')).toEqual(expect.arrayContaining(['NSG-1', 'NSG-3']))
    const body = renderReport({ changed: [{ key: 'L-NSG', url: 'https://x', was: 'a', now: 'b' }], broken: [], baseline: [], lock: {} }, FACTS, 'run')
    expect(body).toContain('NSG-1')
  })
})
