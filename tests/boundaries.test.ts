import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { engineViolations, importSpecifiers } from './support/engineBoundaries.ts'

const ENGINE_DIR = path.resolve(import.meta.dirname, '../src/engine')
const MISSIONS_DIR = path.resolve(import.meta.dirname, '../src/missions')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [full] : []
  })
}

describe('engine boundaries', () => {
  it('the headless engine has no UI imports, no escapes and no non-deterministic calls', () => {
    const files = sourceFiles(ENGINE_DIR)
    expect(files.length).toBeGreaterThan(0)
    const problems = files.flatMap(f => engineViolations(f, readFileSync(f, 'utf8'), ENGINE_DIR))
    expect(problems).toEqual([])
  })
})

describe('mission boundaries', () => {
  it('missions are headless and deterministic too: they may use the engine, nothing from the UI or store', () => {
    const files = sourceFiles(MISSIONS_DIR)
    expect(files.length).toBeGreaterThan(0)
    const problems = files.flatMap(f => engineViolations(f, readFileSync(f, 'utf8'), MISSIONS_DIR, [MISSIONS_DIR, ENGINE_DIR]))
    expect(problems).toEqual([])
  })
})

// The checker guards the most important architecture rule, so it is tested itself.
describe('engine boundary checker', () => {
  const file = path.join(ENGINE_DIR, 'network', 'flow.ts')
  const check = (source: string) => engineViolations(file, source, ENGINE_DIR)

  it('accepts imports that stay inside the engine', () => {
    expect(check(`import { a } from '../world.ts'\nimport type { B } from './types.ts'`)).toEqual([])
  })

  it('rejects React and UI state libraries', () => {
    expect(check(`import { useState } from 'react'`)).toHaveLength(1)
    expect(check(`import { create } from 'zustand'`)).toHaveLength(1)
  })

  it('rejects relative imports that leave src/engine', () => {
    expect(check(`import { App } from '../../ui/App.tsx'`)).toHaveLength(1)
  })

  it('rejects wall-clock time and unseeded randomness, but not in comments', () => {
    expect(check(`const t = Date.now()`)).toHaveLength(1)
    expect(check(`const r = Math.random()`)).toHaveLength(1)
    expect(check(`const d = new Date()`)).toHaveLength(1)
    expect(check(`// never call Date.now() here\n/* or Math.random() */\nexport const x = 1`)).toEqual([])
  })

  it('finds every import form', () => {
    expect(importSpecifiers(`import a from 'x'\nimport 'y'\nexport { b } from 'z'\nconst c = import('w')`))
      .toEqual(['x', 'z', 'y', 'w'])
  })
})
