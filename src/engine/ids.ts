import { nextUint32, type RngState } from './rng.ts'

/**
 * A GUID-shaped identifier (version-4 layout) drawn from the world's dedicated ID stream.
 * Activity log `eventDataId`, `operationId` and `correlationId` are GUIDs on Azure (MON-9).
 * IDs come from their own RNG stream so that issuing commands never shifts gameplay randomness.
 */
export function nextGuid(state: RngState): [string, RngState] {
  let hex = ''
  let s = state
  for (let i = 0; i < 4; i++) {
    const [u, next] = nextUint32(s)
    hex += u.toString(16).padStart(8, '0')
    s = next
  }
  const variant = '89ab'[parseInt(hex[16] ?? '0', 16) & 3] ?? '8'
  const chars = `${hex.slice(0, 12)}4${hex.slice(13, 16)}${variant}${hex.slice(17)}`
  return [`${chars.slice(0, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}-${chars.slice(16, 20)}-${chars.slice(20)}`, s]
}
