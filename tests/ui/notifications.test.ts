import { describe, expect, it } from 'vitest'
import { azure, type World } from '../../src/engine/index.ts'
import { PIXELFORGE_LAUNCH_DAY, registryFor, startMission } from '../../src/missions/index.ts'
import { PLAYER_PRINCIPAL } from '../../src/store/gameStore.ts'
import { notificationsOf, unreadCount } from '../../src/ui/portal/notifications.ts'
import { emptyWorld, ok, rgId, SUB, start } from '../engine/azure/fixtures.ts'

const asPlayer = (w: World, type: string, payload: unknown) => ok(w, type, payload, PLAYER_PRINCIPAL)

describe('notifications (PORTAL-8), derived from the world', () => {
  it('a player deployment shows in progress, then succeeded with Go to resource', () => {
    const base = asPlayer(emptyWorld(), 'arm/resourceGroups/write', { subscriptionId: SUB, name: 'rg-n', location: 'westeurope' })
    const payload = { subscriptionId: SUB, resourceGroupName: 'rg-n', name: 'vnet-n', location: 'westeurope', addressPrefixes: ['10.9.0.0/16'] }
    const running = start(base, 'arm/virtualNetworks/write', payload, PLAYER_PRINCIPAL)
    const vnet = azure.resourceId(SUB, 'rg-n', azure.VNET_TYPE, 'vnet-n')
    expect(notificationsOf(running)[0]).toMatchObject({ kind: 'deployment', status: 'info', title: 'Deployment in progress' })
    const done = asPlayer(base, 'arm/virtualNetworks/write', payload)
    const first = notificationsOf(done)[0]
    expect(first).toMatchObject({ kind: 'deployment', status: 'success', title: 'Deployment succeeded', route: { page: 'resource', id: vnet, section: 'overview' }, action: 'Go to resource' })
  })

  it('a resource group (no deployment) gets Go to resource group', () => {
    const w = asPlayer(emptyWorld(), 'arm/resourceGroups/write', { subscriptionId: SUB, name: 'rg-n', location: 'westeurope' })
    expect(notificationsOf(w)[0]).toMatchObject({ status: 'success', action: 'Go to resource group', route: { page: 'resource', id: rgId('rg-n'), section: 'overview' } })
  })

  it("other people's operations don't notify the player", () => {
    const w = ok(emptyWorld(), 'arm/resourceGroups/write', { subscriptionId: SUB, name: 'rg-other', location: 'westeurope' }, 'mia@pixelforge.example')
    expect(notificationsOf(w)).toEqual([])
  })

  it('ticket messages are labelled as from the client, newest first, and unread counts respect seenAt', () => {
    const w = startMission(PIXELFORGE_LAUNCH_DAY, 'n', registryFor(PIXELFORGE_LAUNCH_DAY))
    const messages = notificationsOf(w).filter(n => n.kind === 'message')
    expect(messages.length).toBeGreaterThan(0)
    expect(messages[0]?.detail).toMatch(/^From .+, PixelForge Games/)
    const all = notificationsOf(w)
    expect([...all].sort((a, b) => b.at - a.at)).toEqual(all)
    expect(unreadCount(w, -1)).toBe(all.length)
    expect(unreadCount(w, Math.max(...all.map(n => n.at)))).toBe(0)
  })

  it('a fired alert is a notification that opens Monitor > Alerts', () => {
    const w = emptyWorld()
    const fired: World = {
      ...w,
      alerts: {
        ...w.alerts,
        fired: [{ id: 'a1', alertRuleId: 'x', alertRuleName: 'alert-game-api', severity: 1, description: '', monitorCondition: 'Fired', userResponse: 'New', firedAt: 60_000, failedLocations: ['a', 'b', 'c'], clearChecks: 0 }],
      },
    }
    expect(notificationsOf(fired)[0]).toMatchObject({ kind: 'alert', status: 'error', title: 'Alert fired: alert-game-api', route: { page: 'service', service: 'monitor', section: 'alerts' } })
  })
})
