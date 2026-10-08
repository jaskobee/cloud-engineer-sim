/**
 * Bounded series for telemetry. Plain data (saved with the world), never mutated in place.
 * Oldest item first. Capacity bounds both memory and save size (bootstrap report §J.8).
 */
export interface RingBuffer<T> {
  readonly capacity: number
  readonly items: readonly T[]
}

export function createRingBuffer<T>(capacity: number): RingBuffer<T> {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`Ring buffer capacity must be a positive integer, got ${capacity}`)
  }
  return { capacity, items: [] }
}

/** A new buffer with `item` appended, dropping the oldest items beyond capacity. */
export function pushRing<T>(buffer: RingBuffer<T>, item: T): RingBuffer<T> {
  const items = [...buffer.items, item]
  return { capacity: buffer.capacity, items: items.length > buffer.capacity ? items.slice(-buffer.capacity) : items }
}
