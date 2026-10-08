/** Weekday and 24-hour time of a sim instant, in the player's time zone unless one is given. */
export function formatSimTime(epochMs: number, simMs: number, timeZone?: string): { day: string; time: string } {
  const at = new Date(epochMs + simMs)
  const zone = timeZone === undefined ? {} : { timeZone }
  return {
    day: new Intl.DateTimeFormat('en-GB', { weekday: 'short', ...zone }).format(at),
    time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', ...zone }).format(at),
  }
}
