import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { azure } from '../../src/engine/index.ts'
import { MENU_TYPES, serviceMenuFor, serviceMenuForService, type MenuGroup } from '../../src/ui/portal/menus.ts'
import { factIds } from '../support/facts.ts'

const FACTS = factIds(readFileSync(path.resolve(import.meta.dirname, '../../Docs/AZURE_FACTS.md'), 'utf8'))

const allMenus: [string, MenuGroup[]][] = [
  ...MENU_TYPES.map(t => [t, serviceMenuFor(t)] as [string, MenuGroup[]]),
  ['monitor', serviceMenuForService('monitor')],
  ['networkWatcher', serviceMenuForService('networkWatcher')],
]

describe('service menus (PORTAL rules)', () => {
  it('every group and item cites a PORTAL rule that exists in the register', () => {
    for (const [owner, groups] of allMenus) {
      for (const g of groups) {
        if (g.label !== null) expect(FACTS.has(g.rule ?? ''), `${owner} group ${g.label}`).toBe(true)
        for (const item of g.items) {
          expect(item.rule, `${owner} ${item.label}`).toMatch(/^PORTAL-\d+s?$/)
          expect(FACTS.has(item.rule), `${owner} ${item.label} → ${item.rule}`).toBe(true)
        }
      }
    }
  })

  it('item ids are unique per menu, and every menu starts with Overview', () => {
    for (const [owner, groups] of allMenus) {
      const ids = groups.flatMap(g => g.items.map(i => i.id))
      expect(new Set(ids).size, owner).toBe(ids.length)
      expect(ids[0], owner).toBe(owner === 'networkWatcher' || owner === 'monitor' ? ids[0] : 'overview')
    }
  })

  it('NSG and VNet menus have the sections the portal puts under Settings (PORTAL-11, PORTAL-12)', () => {
    const nsg = serviceMenuFor(azure.NSG_TYPE)
    expect(nsg.find(g => g.label === 'Settings')?.items.map(i => i.label)).toEqual(['Inbound security rules', 'Outbound security rules', 'Network interfaces', 'Subnets'])
    expect(nsg.find(g => g.label === 'Help')?.items.map(i => i.label)).toEqual(['Effective security rules'])
    const vnet = serviceMenuFor(azure.VNET_TYPE)
    expect(vnet.find(g => g.label === 'Settings')?.items.map(i => i.id)).toEqual(['addressSpace', 'subnets'])
    expect(vnet.find(g => g.label === 'Monitoring')?.items.map(i => i.label)).toEqual(['Diagram'])
  })

  it('Network Watcher has Topology and the two diagnostic tools (PORTAL-16)', () => {
    const nw = serviceMenuForService('networkWatcher')
    expect(nw.find(g => g.label === 'Monitoring')?.items.map(i => i.label)).toEqual(['Topology'])
    expect(nw.find(g => g.label === 'Network diagnostic tools')?.items.map(i => i.label)).toEqual(['IP flow verify', 'Effective security rules'])
  })

  it('an unknown type gets Overview and Activity log only', () => {
    expect(serviceMenuFor('Microsoft.Compute/disks').flatMap(g => g.items.map(i => i.id))).toEqual(['overview', 'activityLog'])
  })
})

describe('stale or unknown sections', () => {
  it('a section the type does not list falls back to Overview', async () => {
    const { resolveSection } = await import('../../src/ui/portal/menus.ts')
    expect(resolveSection(azure.NSG_TYPE, 'inbound')).toBe('inbound')
    expect(resolveSection(azure.NSG_TYPE, 'subnetsOfSomethingElse')).toBe('overview')
    expect(resolveSection(azure.PUBLIC_IP_TYPE, 'inbound')).toBe('overview')
  })
})
