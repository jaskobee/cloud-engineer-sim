import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { citedIds, factIds } from './support/facts.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const FACTS = readFileSync(path.join(ROOT, 'Docs/AZURE_FACTS.md'), 'utf8')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })
}

describe('AZURE_FACTS rule IDs', () => {
  const ids = factIds(FACTS)
  const prefixes = new Set([...ids].map(id => id.split('-')[0] ?? ''))

  it('parses the register', () => {
    for (const id of ['NSG-4', 'MON-8', 'MON-10s', 'ARM-1u']) expect(ids.has(id)).toBe(true)
    expect(ids.size).toBeGreaterThan(50)
  })

  it('every rule ID cited in src/ exists in Docs/AZURE_FACTS.md', () => {
    const unknown = sourceFiles(path.join(ROOT, 'src')).flatMap(file =>
      citedIds(readFileSync(file, 'utf8'), prefixes)
        .filter(id => !ids.has(id))
        .map(id => `${path.relative(ROOT, file)}: ${id}`),
    )
    expect(unknown).toEqual([])
  })

  it('the citation scanner finds IDs and ignores look-alikes', () => {
    expect(citedIds("ruleId: 'NSG-4' // see MON-10s and ARM-1u, not UTF-8", ['NSG', 'MON', 'ARM'])).toEqual(['NSG-4', 'MON-10s', 'ARM-1u'])
  })
})
