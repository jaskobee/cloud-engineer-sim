import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SERVICES, searchPortal } from '../../src/ui/portal/services.ts'
import { browseLabel, hasBrowseList, serviceLabel } from '../../src/ui/portal/route.ts'
import { NSG_GAME, pixelForge } from '../engine/azure/fixtures.ts'
import { factIds } from '../support/facts.ts'

const FACTS = factIds(readFileSync(path.resolve(import.meta.dirname, '../../Docs/AZURE_FACTS.md'), 'utf8'))

describe('service catalogue (PORTAL-5)', () => {
  it('every service cites a rule in the register and opens a list or a service page with the same name', () => {
    expect(SERVICES.map(s => s.id)).toEqual([
      'resourceGroups', 'virtualMachines', 'virtualNetworks', 'networkSecurityGroups', 'publicIpAddresses', 'networkInterfaces',
      'logAnalytics', 'applicationInsights', 'monitor', 'networkWatcher',
    ])
    for (const s of SERVICES) {
      expect(FACTS.has(s.rule), s.id).toBe(true)
      if (s.route.page === 'browse') {
        expect(hasBrowseList(s.route.type), s.id).toBe(true)
        expect(browseLabel(s.route.type)).toBe(s.label)
      } else if (s.route.page === 'service') {
        expect(serviceLabel(s.route.service)).toBe(s.label)
      } else {
        throw new Error(`${s.id} has no list or service page`)
      }
    }
  })

  it('search finds services by name and resources by name, services first', () => {
    const world = pixelForge()
    const hits = searchPortal('network', world)
    expect(hits[0]).toMatchObject({ kind: 'service', label: 'Virtual networks' })
    expect(hits.some(h => h.kind === 'service' && h.label === 'Network Watcher')).toBe(true)
    const nsg = searchPortal('nsg-snet-game', world)
    expect(nsg).toEqual([expect.objectContaining({ kind: 'resource', label: 'nsg-snet-game', route: { page: 'resource', id: NSG_GAME, section: 'overview' } })])
    expect(searchPortal('   ', world)).toEqual([])
  })
})
