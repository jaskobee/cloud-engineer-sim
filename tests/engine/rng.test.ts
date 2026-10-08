import { describe, expect, it } from 'vitest'
import { nextFloat, nextInt, nextUint32, seedRng, type RngState } from '../../src/engine/rng.ts'

function draws(state: RngState, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const [v, next] = nextUint32(state)
    out.push(v)
    state = next
  }
  return out
}

describe('seeded RNG', () => {
  it('gives the same sequence for the same seed and a different one for another seed', () => {
    expect(draws(seedRng('pixelforge'), 8)).toEqual(draws(seedRng('pixelforge'), 8))
    expect(draws(seedRng('pixelforge'), 8)).not.toEqual(draws(seedRng('pixelforge-2'), 8))
  })

  it('keeps its whole state in a JSON-safe value, so a saved game resumes the same sequence', () => {
    const [, mid] = nextUint32(seedRng('save-me'))
    const restored = JSON.parse(JSON.stringify(mid)) as RngState
    expect(draws(restored, 5)).toEqual(draws(mid, 5))
  })

  it('returns 32-bit unsigned integers and floats in [0, 1)', () => {
    let s = seedRng('range')
    for (let i = 0; i < 5000; i++) {
      const [u, s1] = nextUint32(s)
      expect(Number.isInteger(u) && u >= 0 && u <= 0xffffffff).toBe(true)
      const [f, s2] = nextFloat(s1)
      expect(f >= 0 && f < 1).toBe(true)
      s = s2
    }
  })

  it('nextInt is inclusive at both ends and reaches every value', () => {
    let s = seedRng('dice')
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const [v, next] = nextInt(s, 1, 6)
      seen.add(v)
      s = next
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('nextInt rejects an empty or non-integer range', () => {
    const s = seedRng('bad')
    expect(() => nextInt(s, 5, 4)).toThrow(RangeError)
    expect(() => nextInt(s, 0.5, 4)).toThrow(RangeError)
  })
})
