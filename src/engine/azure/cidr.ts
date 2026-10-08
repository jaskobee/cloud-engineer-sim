/**
 * IPv4 and CIDR arithmetic. Plain maths, no Azure rules: the rules that use it (SUB-1..SUB-4,
 * VNET-3, PRIV-1/2) live in the resource modules and cite AZURE_FACTS.
 */

export interface Cidr {
  /** Network address as an unsigned 32-bit integer. */
  network: number
  prefix: number
  /** Number of addresses in the block (2^(32 − prefix)). */
  size: number
}

/** `10.0.1.4` → 167772420. Null unless it's four decimal octets 0–255 without leading zeros. */
export function parseIPv4(text: string): number | null {
  const parts = text.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

export function formatIPv4(value: number): string {
  return [24, 16, 8, 0].map(shift => Math.floor(value / 2 ** shift) % 256).join('.')
}

export interface ParsedCidr extends Cidr {
  /** The address as written. Differs from `network` when the prefix isn't on its network boundary. */
  address: number
  aligned: boolean
}

/** `10.0.1.0/24` → block. Null if the text isn't `a.b.c.d/n` with n in 0–32. */
export function parseCidr(text: string): ParsedCidr | null {
  const slash = text.indexOf('/')
  if (slash < 0) return null
  const address = parseIPv4(text.slice(0, slash))
  const prefixText = text.slice(slash + 1)
  if (address === null || !/^(0|[1-9]\d?)$/.test(prefixText)) return null
  const prefix = Number(prefixText)
  if (prefix > 32) return null
  const size = 2 ** (32 - prefix)
  const network = Math.floor(address / size) * size
  return { address, network, prefix, size, aligned: network === address }
}

export function formatCidr(cidr: Cidr): string {
  return `${formatIPv4(cidr.network)}/${cidr.prefix}`
}

export const lastAddress = (c: Cidr): number => c.network + c.size - 1

export const containsAddress = (c: Cidr, address: number): boolean => address >= c.network && address <= lastAddress(c)

/** `inner` lies entirely within `outer`. */
export const containsCidr = (outer: Cidr, inner: Cidr): boolean =>
  inner.network >= outer.network && lastAddress(inner) <= lastAddress(outer)

export const overlaps = (a: Cidr, b: Cidr): boolean => a.network <= lastAddress(b) && b.network <= lastAddress(a)
