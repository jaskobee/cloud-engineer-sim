import { describe, expect, it } from 'vitest'
import { formatBytes, formatDuration, formatSimTime, niceCeil } from '../../src/ui/format.ts'

describe('formatSimTime', () => {
  // 2026-10-16 06:00 UTC = Friday 08:00 in Berlin (CEST)
  const epoch = Date.UTC(2026, 9, 16, 6, 0, 0)

  it('shows weekday and 24-hour time in the given time zone', () => {
    expect(formatSimTime(epoch, 0, 'Europe/Berlin')).toEqual({ day: 'Fri', time: '08:00:00' })
    expect(formatSimTime(epoch, (13 * 60 + 40) * 60_000 + 5_000, 'Europe/Berlin')).toEqual({ day: 'Fri', time: '21:40:05' })
  })

  it('rolls over to the next day', () => {
    expect(formatSimTime(epoch, 16 * 60 * 60_000 + 1_000, 'Europe/Berlin').day).toBe('Sat')
  })
})

describe('formatDuration', () => {
  it('shows seconds, then minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0 s')
    expect(formatDuration(8_400)).toBe('8 s')
    expect(formatDuration(60_000)).toBe('1 min')
    expect(formatDuration(90_000)).toBe('1 min 30 s')
    expect(formatDuration(-5)).toBe('0 s')
  })
})

describe('formatBytes and niceCeil', () => {
  it('formats bytes with decimal units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(12_000)).toBe('12 kB')
    expect(formatBytes(4_820_000)).toBe('4.8 MB')
    expect(formatBytes(123_000_000)).toBe('123 MB')
  })

  it('rounds axis maxima up to 1, 2 or 5 × 10ⁿ', () => {
    expect(niceCeil(0)).toBe(1)
    expect(niceCeil(3)).toBe(5)
    expect(niceCeil(17)).toBe(20)
    expect(niceCeil(152)).toBe(200)
    expect(niceCeil(7_200_000)).toBe(10_000_000)
    expect(niceCeil(4, 10)).toBe(10)
  })
})
