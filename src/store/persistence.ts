import { loadWorld, saveWorld, type LoadResult, type World } from '../engine/index.ts'
import { emptyProfile, type Profile } from '../missions/index.ts'

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

// ── The player's profile (step 11): career XP and badges across missions ─────────────────────

export const PROFILE_KEY = 'cloud-engineer-sim:profile'

function isProfile(v: unknown): v is Profile {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return p.version === 1 && typeof p.xp === 'number' && Array.isArray(p.badges) && typeof p.runs === 'object' && p.runs !== null
}

/** The stored profile, or an empty one (no storage, nothing saved yet, or an unreadable entry). */
export function readProfile(storage: KeyValueStorage | null): Profile {
  try {
    const text = storage?.getItem(PROFILE_KEY)
    const parsed: unknown = text ? JSON.parse(text) : null
    return isProfile(parsed) ? parsed : emptyProfile()
  } catch {
    return emptyProfile()
  }
}

export function writeProfile(storage: KeyValueStorage | null, profile: Profile): boolean {
  if (!storage) return false
  try {
    storage.setItem(PROFILE_KEY, JSON.stringify(profile))
    return true
  } catch {
    return false
  }
}
