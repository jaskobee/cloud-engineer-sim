/**
 * Seeded pseudo-random numbers (mulberry32, seeded with a 32-bit FNV-1a hash of a string).
 *
 * The state is one plain number, so it lives inside the world, is saved with it, and a loaded
 * game continues the exact same sequence. Functions are pure: they return the value and the
 * next state instead of mutating anything. Not cryptographic, and it doesn't need to be.
 */

/** RNG state: an unsigned 32-bit integer. */
export type RngState = number

/** Derive an initial state from a seed string. */
export function seedRng(seed: string): RngState {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Next unsigned 32-bit integer (0 … 2^32 − 1). */
export function nextUint32(state: RngState): [number, RngState] {
  const next = (state + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [(t ^ (t >>> 14)) >>> 0, next]
}

/** Next float in [0, 1). */
export function nextFloat(state: RngState): [number, RngState] {
  const [u, next] = nextUint32(state)
  return [u / 0x1_0000_0000, next]
}

/** Next integer in [min, max], both inclusive. */
export function nextInt(state: RngState, min: number, max: number): [number, RngState] {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new RangeError(`nextInt needs integers with min <= max, got ${min} and ${max}`)
  }
  const [f, next] = nextFloat(state)
  return [min + Math.floor(f * (max - min + 1)), next]
}
