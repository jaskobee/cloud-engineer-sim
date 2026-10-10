import { describe, expect, it } from 'vitest'
import { step } from '../../src/engine/index.ts'
import { newWorld } from '../../src/store/gameStore.ts'
import { PROFILE_KEY, SAVE_KEY, clearSave, readProfile, readSave, writeProfile, writeSave, type KeyValueStorage } from '../../src/store/persistence.ts'
import { emptyProfile, recordRun } from '../../src/missions/index.ts'

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: k => void data.delete(k),
  }
}

const throwing: KeyValueStorage = {
  getItem: () => { throw new Error('blocked') },
  setItem: () => { throw new Error('quota') },
  removeItem: () => { throw new Error('blocked') },
}

describe('browser save slot', () => {
  it('round-trips the world', () => {
    const storage = memoryStorage()
    const world = step(newWorld('persist'), 42_000)
    expect(writeSave(storage, world)).toBe(true)
    expect(readSave(storage)).toEqual({ ok: true, world })
    expect(storage.data.has(SAVE_KEY)).toBe(true)
  })

  it('reports no save when the slot is empty or cleared', () => {
    const storage = memoryStorage()
    expect(readSave(storage)).toBeNull()
    writeSave(storage, newWorld('x'))
    clearSave(storage)
    expect(readSave(storage)).toBeNull()
  })

  it('reports a damaged save instead of throwing', () => {
    const storage = memoryStorage()
    storage.setItem(SAVE_KEY, '{oops')
    expect(readSave(storage)).toMatchObject({ ok: false, reason: 'invalid-json' })
  })

  it('works without storage at all (private window, blocked site data)', () => {
    expect(writeSave(throwing, newWorld('x'))).toBe(false)
    expect(readSave(throwing)).toBeNull()
    expect(() => clearSave(throwing)).not.toThrow()
    expect(writeSave(null, newWorld('x'))).toBe(false)
    expect(readSave(null)).toBeNull()
  })
})

describe('profile slot (step 11)', () => {
  it('round-trips, falls back to an empty profile, and survives blocked storage', () => {
    const storage = memoryStorage()
    expect(readProfile(storage)).toEqual(emptyProfile())
    const profile = recordRun(emptyProfile(), 'm:seed', { missionId: 'm', mode: 'guided', xp: 900, badges: ['b'] })
    expect(writeProfile(storage, profile)).toBe(true)
    expect(readProfile(storage)).toEqual(profile)
    storage.data.set(PROFILE_KEY, '{"version":7}')
    expect(readProfile(storage)).toEqual(emptyProfile())
    expect(readProfile(throwing)).toEqual(emptyProfile())
    expect(writeProfile(throwing, profile)).toBe(false)
    expect(writeProfile(null, profile)).toBe(false)
  })
})
