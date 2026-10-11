import { describe, expect, it } from 'vitest'
import { azure } from '../../src/engine/index.ts'
import { createGameStore } from '../../src/store/gameStore.ts'
import { breadcrumbFor, HOME, routeForResource, sameRoute, type Route } from '../../src/ui/portal/route.ts'
import { NSG_GAME, pixelForge, rgId, SNET_GAME, VM_GAME, VNET } from '../engine/azure/fixtures.ts'

const world = pixelForge()
const labels = (route: Route) => breadcrumbFor(route, world).map(c => c.label)

describe('routes', () => {
  it('compares routes by value', () => {
    expect(sameRoute({ page: 'browse', type: 'resourceGroups' }, { page: 'browse', type: 'resourceGroups' })).toBe(true)
    expect(sameRoute({ page: 'browse', type: 'resourceGroups' }, { page: 'allServices' })).toBe(false)
  })

  it('routes a resource to its overview, and a child resource to its parent section', () => {
    expect(routeForResource(NSG_GAME, world)).toEqual({ page: 'resource', id: NSG_GAME, section: 'overview' })
    expect(routeForResource(SNET_GAME, world)).toEqual({ page: 'resource', id: VNET, section: 'subnets' })
    const rule = Object.values(world.tenant.resources).find(r => r.type === azure.SECURITY_RULE_TYPE)!
    const direction = String(rule.properties.direction).toLowerCase()
    expect(routeForResource(rule.id, world)).toMatchObject({ page: 'resource', section: direction === 'inbound' ? 'inbound' : 'outbound' })
    expect(routeForResource(rgId(), world)).toEqual({ page: 'resource', id: rgId(), section: 'overview' })
  })

  it('derives the breadcrumb from the route', () => {
    expect(labels(HOME)).toEqual(['Home'])
    expect(labels({ page: 'resource', id: NSG_GAME, section: 'inbound' })).toEqual(['Home', 'Network security groups', 'nsg-snet-game'])
    expect(labels({ page: 'resource', id: VM_GAME, section: 'overview' })).toEqual(['Home', 'Virtual machines', 'vm-game-01'])
    expect(labels({ page: 'resource', id: rgId(), section: 'overview' })).toEqual(['Home', 'Resource groups', 'rg-pixelforge-prod'])
    expect(labels({ page: 'createPicker' })).toEqual(['Home', 'Create a resource'])
    expect(labels({ page: 'allServices' })).toEqual(['Home', 'All services'])
    // No list of its own (there's no verified "All resources" list): through its resource group.
    const disk = Object.values(world.tenant.resources).find(r => r.type === azure.DISK_TYPE)!
    expect(labels({ page: 'resource', id: disk.id, section: 'overview' })).toEqual(['Home', 'Resource groups', 'rg-pixelforge-prod', disk.name])
    expect(labels({ page: 'create', kind: 'virtualNetwork', tab: 'basics' })).toEqual(['Home', 'Create a resource', 'Create virtual network'])
    expect(labels({ page: 'service', service: 'networkWatcher', section: 'ipFlowVerify' })).toEqual(['Home', 'Network Watcher'])
    // Every crumb but the last links somewhere.
    const crumbs = breadcrumbFor({ page: 'resource', id: NSG_GAME, section: 'inbound' }, world)
    expect(crumbs.slice(0, -1).every(c => c.route !== null)).toBe(true)
    expect(crumbs.at(-1)?.route).toBeNull()
  })

  it('a resource that no longer exists still gets a breadcrumb from its ID', () => {
    const gone = azure.resourceId('0000', 'rg-x', azure.NSG_TYPE, 'nsg-gone')
    expect(labels({ page: 'resource', id: gone, section: 'overview' })).toEqual(['Home', 'Network security groups', 'nsg-gone'])
  })
})

describe('store navigation', () => {
  const store = () => createGameStore({ world })

  it('starts on Home with an empty back stack, ticket open and the map closed', () => {
    expect(store().getState().session.ui.nav).toEqual({ route: HOME, back: [], map: false, contextPane: null, ticketOpen: true, notificationsSeenAt: 0 })
  })

  it('navigate and goBack round-trip; the same route twice is kept once', () => {
    const st = store()
    const list: Route = { page: 'browse', type: azure.NSG_TYPE.toLowerCase() }
    st.getState().navigate(list)
    st.getState().navigate(list)
    st.getState().navigate({ page: 'resource', id: NSG_GAME, section: 'overview' })
    expect(st.getState().session.ui.nav.back).toEqual([HOME, list])
    st.getState().goBack()
    expect(st.getState().session.ui.nav.route).toEqual(list)
    st.getState().goBack()
    st.getState().goBack()
    expect(st.getState().session.ui.nav.route).toEqual(HOME)
  })

  it('goBack after create returns to the wizard route, not past it', () => {
    const st = store()
    st.getState().navigate({ page: 'createPicker' })
    st.getState().navigate({ page: 'create', kind: 'virtualNetwork', tab: 'basics' })
    st.getState().navigate({ page: 'resource', id: VNET, section: 'overview' })
    st.getState().goBack()
    expect(st.getState().session.ui.nav.route).toEqual({ page: 'create', kind: 'virtualNetwork', tab: 'basics' })
  })

  it('navigating leaves map mode and closes a context pane', () => {
    const st = store()
    st.getState().toggleMap(true)
    st.getState().openContextPane({ kind: 'flow', flowId: 'x' })
    st.getState().navigate({ page: 'allServices' })
    expect(st.getState().session.ui.nav).toMatchObject({ map: false, contextPane: null })
  })

  it('select and startCreate keep working on top of navigation', () => {
    const st = store()
    st.getState().select(SNET_GAME)
    expect(st.getState().session.ui.nav.route).toEqual({ page: 'resource', id: VNET, section: 'subnets' })
    st.getState().startCreate({ kind: null })
    expect(st.getState().session.ui.nav.route).toEqual({ page: 'createPicker' })
    st.getState().startCreate({ kind: 'virtualMachine' })
    expect(st.getState().session.ui.nav.route).toEqual({ page: 'create', kind: 'virtualMachine', tab: 'basics' })
    st.getState().startCreate({ kind: 'securityRule', preset: { networkSecurityGroupId: NSG_GAME } })
    expect(st.getState().session.ui.nav.contextPane).toEqual({ kind: 'create', request: { kind: 'securityRule', preset: { networkSecurityGroupId: NSG_GAME } } })
    st.getState().startCreate(null)
    expect(st.getState().session.ui.nav.contextPane).toBeNull()
    st.getState().startCreate({ kind: 'networkInterface', preset: { mode: 'edit', name: 'nic-game-01' } })
    expect(st.getState().session.ui.nav.contextPane).toMatchObject({ kind: 'create', request: { kind: 'networkInterface' } })
  })
})
