import { describe, expect, it } from 'vitest'
import {
  azure, deploymentTimestamp, dispatch, dryRun, loadWorld, pruneDeploymentHistory, saveWorld, step, TICK_MS,
  DEPLOYMENT_HISTORY_LIMIT, type Deployment, type World,
} from '../../src/engine/index.ts'
import {
  emptyWorld, expectRule, id, NSG_GAME, ok, registry, RG, settle, SNET_GAME, start, SUB, VNET, withSubnets, withVnet,
} from './azure/fixtures.ts'

const running = (w: World) => Object.values(w.deployments).filter(d => d.provisioningState === 'Running')
const only = (w: World): Deployment => {
  const all = Object.values(w.deployments)
  const last = all.at(-1)
  if (!last) throw new Error('no deployment')
  return last
}
const state = (w: World, resourceId: string) => azure.getResource(w, resourceId)?.provisioningState

describe('asynchronous writes run as deployments (ARM-5, ARM-12s, MON-10s)', () => {
  const vnetWrite = { subscriptionId: SUB, resourceGroupName: RG, name: 'vnet-pixelforge', location: 'westeurope', addressPrefixes: ['10.40.0.0/16'] }
  const begin = () => {
    const w = ok(emptyWorld(), 'arm/resourceGroups/write', { subscriptionId: SUB, name: RG, location: 'westeurope' })
    return start(step(w, 2_500), 'arm/virtualNetworks/write', vnetWrite)
  }

  it('shows the resource as Creating and logs only Started until the operation completes', () => {
    const w = begin()
    expect(state(w, VNET)).toBe('Creating')
    expect(w.activityLog.at(-1)).toMatchObject({ status: 'Started', operationName: 'Microsoft.Network/virtualNetworks/write' })
    const d = only(w)
    expect(d).toMatchObject({
      provisioningState: 'Running', startedAt: 2_500, endsAt: 2_500 + azure.PROVISIONING_MS['arm/virtualNetworks/write']!,
      subscriptionId: SUB, resourceGroupName: RG, caller: 'engineer@pixelforge.example',
      operation: { targetResourceId: VNET, created: [VNET], updated: [], deleted: [] },
    })
    expect(d.name).toMatch(/^vnet-pixelforge-\d{14}$/)
    expect(d.operation.operationId).toBe(w.activityLog.at(-1)?.operationId)
    expect(d.correlationId).toBe(w.activityLog.at(-1)?.correlationId)
  })

  it('completes at the first tick boundary after endsAt and logs Succeeded with the same IDs', () => {
    const w = begin()
    const d = only(w)
    const before = step(w, d.endsAt - w.clock.now - 1)
    expect(state(before, VNET)).toBe('Creating')
    expect(running(before)).toHaveLength(1)

    const after = settle(w)
    const boundary = Math.ceil(d.endsAt / TICK_MS) * TICK_MS
    expect(state(after, VNET)).toBe('Succeeded')
    expect(after.deployments[d.id]).toMatchObject({ provisioningState: 'Succeeded', completedAt: boundary })
    expect(after.activityLog.at(-1)).toMatchObject({
      status: 'Succeeded', eventDataId: d.finishedEventDataId, operationId: d.operation.operationId,
      correlationId: d.correlationId, resourceId: VNET, eventTimestamp: boundary,
    })
  })

  it('takes the made-up durations from PROVISIONING_MS (ARM-13s)', () => {
    expect(azure.PROVISIONING_MS['arm/virtualMachines/write']).toBe(90_000)
    expect(azure.PROVISIONING_MS['arm/resourceGroups/write']).toBeUndefined()
  })

  it('resource group writes complete at once, without a deployment (ARM-6)', () => {
    const w = ok(emptyWorld(), 'arm/resourceGroups/write', { subscriptionId: SUB, name: RG, location: 'westeurope' })
    expect(Object.keys(w.deployments)).toHaveLength(0)
    expect(w.activityLog.slice(-2).map(e => e.status)).toEqual(['Started', 'Succeeded'])
  })

  it('an update shows Updating, then Succeeded (ARM-1s)', () => {
    const w = start(withSubnets(), 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.1.0/24', networkSecurityGroupId: NSG_GAME })
    expect(state(w, SNET_GAME)).toBe('Updating')
    expect(only(w).operation.updated).toContain(SNET_GAME)
    expect(state(settle(w), SNET_GAME)).toBe('Succeeded')
  })

  it('a delete keeps the resource as Deleting until the operation completes', () => {
    const rule = `${NSG_GAME}/securityRules/Allow-HTTPS`
    let w = ok(withSubnets(), 'arm/securityRules/write', {
      networkSecurityGroupId: NSG_GAME, name: 'Allow-HTTPS',
      properties: { priority: 200, direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefix: 'Internet', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '443' },
    })
    w = start(w, 'arm/securityRules/delete', { securityRuleId: rule })
    expect(state(w, rule)).toBe('Deleting')
    expect(only(w).operation.deleted).toEqual([rule])
    expect(azure.getResource(settle(w), rule)).toBeUndefined()
  })
})

describe('busy resources (ARM-11u)', () => {
  it('refuses a write to a resource whose operation is still running, in dispatch and in Review + create', () => {
    const w = start(withVnet(), 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.1.0/24' })
    const again = { type: 'arm/subnets/write', caller: 'p', payload: { virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.1.0/24' } }
    const refusal = dryRun(w, registry, again)
    expect(refusal).toMatchObject({ kind: 'not-modelled', ruleId: 'ARM-11u' })
    expect(refusal?.message).toContain("'snet-game' is still creating")
    const { world, outcome } = dispatch(w, registry, again)
    expect(outcome.status).toBe('refused')
    expect(world.tenant).toBe(w.tenant)
    expect(world.activityLog.slice(-2).map(e => e.status)).toEqual(['Started', 'Failed'])
  })

  it('refuses creating a resource that references one still being created', () => {
    const w = start(withVnet(), 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.1.0/24' })
    const nic = { type: 'arm/networkInterfaces/write', caller: 'p', payload: { subscriptionId: SUB, resourceGroupName: RG, name: 'nic-1', location: 'westeurope', subnetId: SNET_GAME } }
    const refusal = dryRun(w, registry, nic)
    if (!refusal) throw new Error('expected a refusal')
    expectRule(refusal, 'ARM-11u', 'not-modelled')
    expect(dryRun(settle(w), registry, nic)).toBeNull()
  })

  it('independent writes run in parallel (ARM-8)', () => {
    let w = start(withVnet(), 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.1.0/24' })
    w = start(w, 'arm/networkSecurityGroups/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'nsg-a', location: 'westeurope' })
    expect(running(w)).toHaveLength(2)
    expect(running(settle(w))).toHaveLength(0)
  })
})

describe('virtual machines (VM-7, VM-15s, VM-19s)', () => {
  const NIC = id(azure.NIC_TYPE, 'nic-game-01')
  const VM = id(azure.VM_TYPE, 'vm-game-01')
  const begin = () => {
    let w = withSubnets()
    w = ok(w, 'arm/networkInterfaces/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'nic-game-01', location: 'westeurope', subnetId: SNET_GAME })
    return start(w, 'arm/virtualMachines/write', {
      subscriptionId: SUB, resourceGroupName: RG, name: 'vm-game-01', location: 'westeurope', vmSize: 'Standard_B2s_v2',
      image: 'Ubuntu2204', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops', networkInterfaceId: NIC,
    })
  }

  it('the VM and its OS disk are Creating together and the VM is in the creating power state', () => {
    const w = begin()
    const disk = id(azure.DISK_TYPE, 'vm-game-01_OsDisk_1')
    expect(only(w).operation.created).toEqual(expect.arrayContaining([VM, disk]))
    expect([state(w, VM), state(w, disk)]).toEqual(['Creating', 'Creating'])
    expect(azure.powerStateOf(step(w, 30_000), VM)).toBe('creating')
    const done = settle(w)
    expect([state(done, VM), state(done, disk)]).toEqual(['Succeeded', 'Succeeded'])
    expect(azure.powerStateOf(done, VM)).toBe('running')
  })

  it('network diagnostics need the VM to be running (NW-5u, VM-5)', () => {
    const w = step(begin(), 10_000)
    const verify = azure.ipFlowVerify(w, { vmId: VM, direction: 'Inbound', protocol: 'Tcp', localIp: '10.40.1.4', localPort: 443, remoteIp: '198.51.100.7', remotePort: 50000 })
    expect(verify).toMatchObject({ ok: false, refusal: { ruleId: 'NW-5u' } })
    expect(azure.effectiveSecurityRules(w, NIC)).toMatchObject({ ok: false, refusal: { ruleId: 'VM-5' } })
  })
})

describe('security rules take effect when their write succeeds (ARM-14s)', () => {
  it('a rule that is still Creating does not decide traffic yet', () => {
    let w = ok(withSubnets(), 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.1.0/24', networkSecurityGroupId: NSG_GAME })
    w = ok(w, 'arm/networkInterfaces/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'nic-game-01', location: 'westeurope', subnetId: SNET_GAME })
    w = start(w, 'arm/securityRules/write', {
      networkSecurityGroupId: NSG_GAME, name: 'Allow-HTTPS',
      properties: { priority: 200, direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefix: 'Internet', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '443' },
    })
    const flow: azure.NicFlow = { nicId: id(azure.NIC_TYPE, 'nic-game-01'), direction: 'Inbound', protocol: 'Tcp', localIp: '10.40.1.4', localPort: 443, remoteIp: '198.51.100.7', remotePort: 50000 }
    const decided = (x: World) => {
      const v = azure.evaluateFlow(x, flow)
      return v.kind === 'decided' ? v.stages.at(-1)?.ruleName : v.refusal.kind
    }
    expect(decided(w)).toBe('DenyAllInbound')
    expect(decided(settle(w))).toBe('Allow-HTTPS')
  })
})

describe('deployments are plain, deterministic data', () => {
  it('step(step(w, a), b) equals step(w, a + b) with a deployment in flight', () => {
    const w = start(withVnet(), 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.1.0/24' })
    expect(step(step(w, 1_700), 6_300)).toEqual(step(w, 8_000))
  })

  it('a save taken mid-deployment loads and completes the same way', () => {
    const w = start(withVnet(), 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.1.0/24' })
    const loaded = loadWorld(saveWorld(w))
    if (!loaded.ok) throw new Error(loaded.message)
    expect(settle(loaded.world)).toEqual(settle(w))
  })

  it('names deployments with a UTC timestamp of the sim time', () => {
    expect(deploymentTimestamp(Date.UTC(2026, 9, 9, 18, 0, 0), 61_500)).toBe('20261009180101')
    expect(deploymentTimestamp(Date.UTC(2024, 1, 29, 23, 59, 59), 1_000)).toBe('20240301000000')
  })

  it('keeps the newest 800 deployments per resource group, never dropping running ones (ARM-10)', () => {
    const make = (i: number, state: Deployment['provisioningState'], rg = RG): Deployment => ({
      id: `d${String(i).padStart(4, '0')}`, name: `x-${i}`, correlationId: 'c', subscriptionId: SUB, resourceGroupName: rg, caller: 'p',
      provisioningState: state, startedAt: i, endsAt: i + 1, finishedEventDataId: 'e',
      operation: { operationId: `o${i}`, operationName: 'n', targetResourceId: 't', created: [], updated: [], deleted: [] },
    })
    const all: Record<string, Deployment> = {}
    for (let i = 0; i < DEPLOYMENT_HISTORY_LIMIT + 5; i++) all[make(i, i === 0 ? 'Running' : 'Succeeded').id] = make(i, i === 0 ? 'Running' : 'Succeeded')
    all['other'] = make(9999, 'Succeeded', 'rg-other')
    const kept = pruneDeploymentHistory(all, SUB, RG)
    const inRg = Object.values(kept).filter(d => d.resourceGroupName === RG)
    expect(inRg).toHaveLength(DEPLOYMENT_HISTORY_LIMIT)
    expect(kept['d0000']?.provisioningState).toBe('Running')
    expect(kept['d0001']).toBeUndefined()
    expect(kept['other']).toBeDefined()
  })
})
