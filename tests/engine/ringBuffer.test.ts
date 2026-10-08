import { describe, expect, it } from 'vitest'
import { createRingBuffer, pushRing } from '../../src/engine/ringBuffer.ts'
import { deepFreeze } from '../support/freeze.ts'

describe('ring buffer (bounded telemetry)', () => {
  it('keeps only the newest `capacity` items, oldest first', () => {
    let rb = createRingBuffer<number>(3)
    for (const n of [1, 2, 3, 4, 5]) rb = pushRing(rb, n)
    expect(rb.items).toEqual([3, 4, 5])
    expect(rb.capacity).toBe(3)
  })

  it('never mutates the buffer it was given', () => {
    const rb = deepFreeze(createRingBuffer<number>(2))
    const next = pushRing(rb, 1)
    expect(rb.items).toEqual([])
    expect(next.items).toEqual([1])
  })

  it('requires a positive integer capacity', () => {
    expect(() => createRingBuffer(0)).toThrow(RangeError)
    expect(() => createRingBuffer(1.5)).toThrow(RangeError)
  })
})
