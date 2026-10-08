import { describe, expect, it } from 'vitest'
import {
  containsAddress, containsCidr, formatCidr, formatIPv4, lastAddress, overlaps, parseCidr, parseIPv4,
} from '../../../src/engine/azure/cidr.ts'

const cidr = (text: string) => {
  const c = parseCidr(text)
  if (!c) throw new Error(`bad test CIDR ${text}`)
  return c
}

describe('IPv4 parsing', () => {
  it('round-trips addresses', () => {
    for (const ip of ['0.0.0.0', '10.40.1.4', '203.0.113.10', '255.255.255.255']) expect(formatIPv4(parseIPv4(ip) ?? -1)).toBe(ip)
  })

  it('rejects malformed addresses', () => {
    for (const bad of ['', '10.0.0', '10.0.0.0.1', '256.0.0.1', '10.0.0.01', '10.0.0.-1', 'a.b.c.d', '10.0.0.1/24']) {
      expect(parseIPv4(bad)).toBeNull()
    }
  })
})

describe('CIDR blocks', () => {
  it('parses size and network', () => {
    const c = cidr('10.40.1.0/24')
    expect(c).toMatchObject({ prefix: 24, size: 256, aligned: true })
    expect(formatIPv4(lastAddress(c))).toBe('10.40.1.255')
    expect(cidr('0.0.0.0/0').size).toBe(2 ** 32)
  })

  it('notices a prefix that is not on its network boundary', () => {
    const c = cidr('10.40.1.5/24')
    expect(c.aligned).toBe(false)
    expect(formatCidr(c)).toBe('10.40.1.0/24')
  })

  it('rejects malformed blocks', () => {
    for (const bad of ['10.0.0.0', '10.0.0.0/', '10.0.0.0/33', '10.0.0.0/08', '10.0.0/24', '/24']) expect(parseCidr(bad)).toBeNull()
  })

  it('answers containment and overlap', () => {
    const vnet = cidr('10.40.0.0/16')
    expect(containsCidr(vnet, cidr('10.40.2.0/24'))).toBe(true)
    expect(containsCidr(vnet, cidr('10.41.0.0/24'))).toBe(false)
    expect(containsCidr(cidr('10.40.1.0/24'), vnet)).toBe(false)
    expect(overlaps(cidr('10.40.1.0/24'), cidr('10.40.1.128/25'))).toBe(true)
    expect(overlaps(cidr('10.40.1.0/24'), cidr('10.40.2.0/24'))).toBe(false)
    expect(containsAddress(cidr('10.40.1.0/24'), parseIPv4('10.40.1.255') ?? 0)).toBe(true)
    expect(containsAddress(cidr('10.40.1.0/24'), parseIPv4('10.40.2.0') ?? 0)).toBe(false)
  })
})
