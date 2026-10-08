import { loadWorld, saveWorld, type LoadResult, type World } from '../engine/index.ts'

/** The browser save slot. One game per browser for now. */
export const SAVE_KEY = 'cloud-engineer-sim:save'

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * localStorage, or null where it's unavailable. Storage can be missing or throw in private windows or
 * with blocked site data, so every access is guarded and the game works without it (it just can't save).
 */
export function browserStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** True when the save was written. */
export function writeSave(storage: KeyValueStorage | null, world: World): boolean {
  if (!storage) return false
  try {
    storage.setItem(SAVE_KEY, saveWorld(world))
    return true
  } catch {
    return false
  }
}

/** Null when there is no save (or storage is unavailable); otherwise the load result, which may be a failure. */
export function readSave(storage: KeyValueStorage | null): LoadResult | null {
  if (!storage) return null
  let text: string | null
  try {
    text = storage.getItem(SAVE_KEY)
  } catch {
    return null
  }
  return text === null ? null : loadWorld(text)
}

export function clearSave(storage: KeyValueStorage | null): void {
  try {
    storage?.removeItem(SAVE_KEY)
  } catch {
    // Nothing to clear if storage is blocked.
  }
}
