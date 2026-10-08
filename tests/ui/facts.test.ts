import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFacts, ruleInfo } from '../../src/ui/facts.ts'

const FACTS = readFileSync(path.resolve(import.meta.dirname, '../../Docs/AZURE_FACTS.md'), 'utf8')

describe('facts register in the UI', () => {
  it('links rules to their Learn pages', () => {
    const nsg1 = ruleInfo('NSG-1')
    expect(nsg1?.status).toBe('VERIFIED')
    expect(nsg1?.sources.map(s => s.url)).toEqual(['https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview'])
    expect(ruleInfo('NSG-2u')?.sources.map(s => s.key)).toEqual(['L-NSGMAN', 'L-TPL-RULE'])
  })

  it('keeps escaped pipes inside a cell', () => {
    expect(ruleInfo('NAME-4')?.text).toContain('*#&+:<>?@%{}\\/|')
    expect(ruleInfo('NAME-4')?.status).toBe('VERIFIED')
  })

  it('every source key a rule cites is defined, and every cited Learn link is a learn.microsoft.com page', () => {
    const rules = parseFacts(FACTS)
    expect(rules.size).toBeGreaterThan(100)
    for (const rule of rules.values()) {
      for (const s of rule.sources) expect(s.url).toMatch(/^https:\/\/learn\.microsoft\.com\//)
    }
    const unknownKeys = [...FACTS.matchAll(/^\|\s*[A-Z]{2,5}-\d+[a-z]?\s*\|.*\|\s*([^|]*?)\s*\|\s*[A-Z][^|]*\|\s*$/gm)]
      .flatMap(m => (m[1] ?? '').split(',').map(k => k.trim()))
      .filter(k => k.startsWith('L-') && ![...rules.values()].some(r => r.sources.some(s => s.key === k)))
    expect(unknownKeys).toEqual([])
  })
})
