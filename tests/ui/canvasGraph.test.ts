import { describe, expect, it } from 'vitest'
import { azure, step } from '../../src/engine/index.ts'
import type { WatchedFlow } from '../../src/store/gameStore.ts'
import { buildCanvasGraph, evaluateWatchedFlow, INTERNET_ID, type CanvasBox, type CanvasNode } from '../../src/ui/canvas/graph.ts'
import {
  GAME_IP, id, JONAS, NIC_DB, NIC_GAME, NSG_DATA, NSG_GAME, ok, PIP_GAME as PIP, pixelForge, pixelForgeWithApps, RG, securityRule as rule,
  SNET_DATA, SNET_GAME, start, SUB, VM_DB, VM_GAME, VNET, withSubnets,
} from '../engine/azure/fixtures.ts'

const DISK_GAME = id(azure.DISK_TYPE, 'vm-game-01_OsDisk_1')


const players: WatchedFlow = { id: 'players', vmId: VM_GAME, direction: 'Inbound', protocol: 'Tcp', localPort: 443, remoteIp: '198.51.100.77', remotePort: 50000 }
const gameToDb: WatchedFlow = { id: 'db', vmId: VM_DB, direction: 'Inbound', protocol: 'Tcp', localPort: 5432, remoteIp: GAME_IP, remotePort: 50000 }

const k = (armId: string) => armId.toLowerCase()
const box = (g: ReturnType<typeof buildCanvasGraph>, armId: string) => g.boxes.find(b => b.id === k(armId))
const node = (g: ReturnType<typeof buildCanvasGraph>, nodeId: string) => g.nodes.find(n => n.id === nodeId)
const inside = (inner: { x: number; y: number; width: number; height: number }, outer: CanvasBox) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height

describe('canvas graph: what exists and where it lives', () => {
  const g = buildCanvasGraph(pixelForge(), [])

  it('nests resource group → VNet → subnet → compute unit, geometrically', () => {
    const rg = box(g, azure.resourceGroupId(SUB, RG))!
    const vnet = box(g, VNET)!
    const game = box(g, SNET_GAME)!
    const unit = node(g, k(NIC_GAME))!
    expect(inside(vnet, rg)).toBe(true)
    expect(inside(game, vnet)).toBe(true)
    expect(inside(unit, game)).toBe(true)
    expect(inside(node(g, k(NIC_DB))!, box(g, SNET_DATA)!)).toBe(true)
  })

  it('draws the resource group with its metadata location, not as a region (RG-1)', () => {
    expect(box(g, azure.resourceGroupId(SUB, RG))?.detail).toBe('Resource group · metadata in West Europe')
    expect(box(g, VNET)?.detail).toBe('10.40.0.0/16 · West Europe')
  })

  it('draws a VM through its NIC, with the NIC and public IP as chips (D-5, PIP-8)', () => {
    const unit = node(g, k(NIC_GAME))!
    expect(unit).toMatchObject({ kind: 'compute', title: 'vm-game-01', typeLabel: 'Virtual machine', resourceId: VM_GAME, status: { tone: 'ok', text: 'Running' } })
    expect(unit.chips.map(c => c.kind)).toEqual(['networkInterface', 'publicIp'])
    expect(unit.chips[0]?.label).toBe(`nic-game-01 · ${GAME_IP}`)
    expect(node(g, k(PIP))).toBeUndefined()
  })

  it('puts NSGs and OS disks beside the VNet, not inside a subnet (NSG-12, VM-15s)', () => {
    const vnet = box(g, VNET)!
    for (const r of [NSG_GAME, NSG_DATA, DISK_GAME]) {
      const n = node(g, k(r))!
      expect(n.kind).toBe('resource')
      expect(n.x).toBeGreaterThanOrEqual(vnet.x + vnet.width)
    }
  })

  it('shows the subnet NSG as a chip on the subnet', () => {
    expect(box(g, SNET_GAME)?.chips).toEqual([{ resourceId: NSG_GAME, kind: 'networkSecurityGroup', label: 'NSG nsg-snet-game' }])
  })

  it('lays compute units out without overlaps, the same way every time', () => {
    const units = g.nodes.filter(n => n.kind !== 'internet')
    for (const a of units) for (const b of units) {
      if (a === b) continue
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false)
    }
    expect(buildCanvasGraph(pixelForge(), [])).toEqual(g)
  })
})

describe('canvas graph: association lines come only from stored references', () => {
  it('draws NSG → subnet and OS disk → VM lines from dependenciesOf', () => {
    const lines = buildCanvasGraph(pixelForge(), []).edges.filter(e => e.kind === 'association').map(e => `${e.dependency}: ${e.source.split('/').at(-1)} → ${e.target.split('/').at(-1)}`)
    expect(lines.sort()).toEqual([
      'networkSecurityGroup: nsg-snet-data → snet-data',
      'networkSecurityGroup: nsg-snet-game → snet-game',
      'osDisk: vm-db-01_osdisk_1 → nic-db-01',
      'osDisk: vm-game-01_osdisk_1 → nic-game-01',
    ])
  })

  it('removes the line when the association is removed', () => {
    const w = ok(pixelForge(), 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.1.0/24', networkSecurityGroupId: null })
    const g = buildCanvasGraph(w, [])
    expect(g.edges.some(e => e.target === k(SNET_GAME))).toBe(false)
    expect(box(g, SNET_GAME)?.chips).toEqual([])
  })
})

describe('canvas graph: traffic comes only from the flow evaluator (rule 5)', () => {
  it('draws Internet → game as allowed, with the same verdict as IP flow verify', () => {
    const w = pixelForge()
    const edge = buildCanvasGraph(w, [players]).edges.find(e => e.kind === 'traffic')!
    expect(edge).toMatchObject({ source: INTERNET_ID, target: k(NIC_GAME), label: 'TCP 443', verdict: 'allowed', reason: 'Allowed by Allow-HTTPS' })
    const verify = azure.ipFlowVerify(w, { vmId: VM_GAME, direction: 'Inbound', protocol: 'Tcp', localIp: GAME_IP, localPort: 443, remoteIp: '198.51.100.77', remotePort: 50000 })
    expect(verify).toMatchObject({ ok: true, access: 'Access allowed', ruleName: 'Allow-HTTPS' })
  })

  it('turns red and names the deciding rule in the PixelForge incident (NSG-1)', () => {
    let w = rule(pixelForge(), NSG_GAME, 'Deny-Internet-Inbound', { priority: 100, access: 'Deny', protocol: '*', destinationPortRange: '*' }, JONAS)
    const edge = () => buildCanvasGraph(w, [players]).edges.find(e => e.kind === 'traffic')!
    expect(edge()).toMatchObject({ verdict: 'denied', reason: 'Denied by Deny-Internet-Inbound in nsg-snet-game (inbound at vm-game-01)' })
    // The fix shows only once the delete has succeeded (ARM-14s).
    w = start(w, 'arm/securityRules/delete', { securityRuleId: `${NSG_GAME}/securityRules/Deny-Internet-Inbound` })
    expect(edge().verdict).toBe('denied')
    w = ok(w, 'arm/networkSecurityGroups/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'nsg-unrelated', location: 'westeurope' })
    expect(edge().verdict).toBe('allowed')
  })

  it('checks both ends between two VMs: sender outbound, then receiver inbound (NSG-7)', () => {
    const w = pixelForge()
    const e = evaluateWatchedFlow(w, gameToDb)!
    expect(e).toMatchObject({ source: k(NIC_GAME), target: k(NIC_DB), verdict: 'allowed', label: 'TCP 5432' })
    expect(e.checks.map(c => `${c.vmName} ${c.direction}`)).toEqual(['vm-game-01 Outbound', 'vm-db-01 Inbound'])

    const blocked = rule(w, NSG_GAME, 'Deny-Out-Postgres', { direction: 'Outbound', access: 'Deny', priority: 150, sourceAddressPrefix: '*', destinationAddressPrefix: 'VirtualNetwork', destinationPortRange: '5432' })
    expect(evaluateWatchedFlow(blocked, gameToDb)).toMatchObject({ verdict: 'denied', reason: 'Denied by Deny-Out-Postgres in nsg-snet-game (outbound at vm-game-01)' })
  })

  it('never guesses: a refused flow is drawn as not modelled (NSG-15s)', () => {
    const odd: WatchedFlow = { ...players, id: 'odd', remoteIp: '172.20.0.5' }
    expect(buildCanvasGraph(pixelForge(), [odd]).edges.find(e => e.kind === 'traffic')).toMatchObject({ verdict: 'not-modelled' })
  })

  it('drops a watched flow whose VM no longer exists, and shows in-progress states', () => {
    expect(evaluateWatchedFlow(withSubnets(), players)).toBeNull()
    const creating = start(pixelForge(), 'arm/networkSecurityGroups/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'nsg-new', location: 'westeurope' })
    const n: CanvasNode | undefined = node(buildCanvasGraph(creating, []), k(id(azure.NSG_TYPE, 'nsg-new')))
    expect(n?.status).toEqual({ tone: 'progress', text: 'Creating…' })
  })

  it('shows a VM that is still being created as in progress, and its flows as unavailable (NW-5u)', () => {
    let w = ok(withSubnets(), 'arm/networkInterfaces/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'nic-game-01', location: 'westeurope', subnetId: SNET_GAME })
    w = start(w, 'arm/virtualMachines/write', {
      subscriptionId: SUB, resourceGroupName: RG, name: 'vm-game-01', location: 'westeurope', vmSize: 'Standard_B2s_v2',
      image: 'Ubuntu2204', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops', networkInterfaceId: NIC_GAME,
    })
    const g = buildCanvasGraph(w, [players])
    expect(node(g, k(NIC_GAME))?.status).toEqual({ tone: 'progress', text: 'Creating…' })
    expect(g.edges.find(e => e.kind === 'traffic')?.verdict).toBe('not-modelled')
  })
})

describe('canvas graph: app health on the VM card (RUN-2s)', () => {
  it('shows the app status, and why it is degraded on hover', () => {
    const up = step(pixelForgeWithApps(), 1_000)
    expect(node(buildCanvasGraph(up, []), k(NIC_GAME))?.status).toMatchObject({ tone: 'ok', text: 'Game API up' })
    const broken = step(rule(pixelForgeWithApps(), NSG_DATA, 'Deny-Postgres', { priority: 150, access: 'Deny', sourceAddressPrefix: '10.40.1.0/24', destinationPortRange: '5432' }), 1_000)
    const status = node(buildCanvasGraph(broken, []), k(NIC_GAME))?.status
    expect(status).toMatchObject({ tone: 'warn', text: 'Game API degraded' })
    expect(status?.detail).toContain('Deny-Postgres')
  })
})
