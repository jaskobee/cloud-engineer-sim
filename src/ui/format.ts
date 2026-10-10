/** Weekday and 24-hour time of a sim instant, in the player's time zone unless one is given. */
export function formatSimTime(epochMs: number, simMs: number, timeZone?: string): { day: string; time: string } {
  const at = new Date(epochMs + simMs)
  const zone = timeZone === undefined ? {} : { timeZone }
  return {
    day: new Intl.DateTimeFormat('en-GB', { weekday: 'short', ...zone }).format(at),
    time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', ...zone }).format(at),
  }
}

/** A sim duration for people: "8 s", "1 min", "1 min 30 s". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const rest = s % 60
  return rest === 0 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 60)} min ${rest} s`
}

/** Bytes for people, decimal units like Azure's metric charts: "0 B", "512 B", "12 kB", "4.8 MB". */
export function formatBytes(bytes: number): string {
  const units = ['B', 'kB', 'MB', 'GB', 'TB']
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  const shown = unit === 0 || value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '')
  return `${shown} ${units[unit]}`
}

/** The smallest "nice" number (1, 2 or 5 times a power of ten) at or above `n`; at least `floor`. */
export function niceCeil(n: number, floor = 1): number {
  const target = Math.max(n, floor)
  const power = 10 ** Math.floor(Math.log10(target))
  for (const step of [1, 2, 5, 10]) if (step * power >= target) return step * power
  return 10 * power
}
