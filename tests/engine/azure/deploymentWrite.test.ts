import { describe, expect, it } from 'vitest'
import { azure, DEPLOYMENT_COMMAND, dispatch, dryRun, step, TICK_MS, type World } from '../../../src/engine/index.ts'
import { expectRule, id, PLAYER, RG, registry, settle, SNET_GAME, SUB, withSubnets } from './fixtures.ts'

/** The portal's Create a virtual machine with a new NIC and public IP, as one deployment (ARM-15s, PORTAL-20). */
const base = { subscriptionId: SUB, resourceGroupName: RG, location: 'westeurope' }
const PIP = id(azure.PUBLIC_IP_TYPE, 'vm-web-ip')
const NIC = id(azure.NIC_TYPE, 'vm-web-nic')
const VM = id(azure.VM_TYPE, 'vm-web')

const pip = { type: 'arm/publicIPAddresses/write', payload: { ...base, name: 'vm-web-ip', sku: { name: 'Standard', tier: 'Regional' }, publicIPAllocationMethod: 'Static', publicIPAddressVersion: 'IPv4' } }
const nic = { type: 'arm/networkInterfaces/write', payload: { ...base, name: 'vm-web-nic', subnetId: SNET_GAME, privateIPAllocationMethod: 'Dynamic', publicIPAddressId: PIP, networkSecurityGroupId: null } }
const vm = (over: Record<string, unknown> = {}) => ({
  type: 'arm/virtualMachines/write',
  payload: { ...base, name: 'vm-web', vmSize: 'Standard_B2s_v2', image: 'Ubuntu2204', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops', networkInterfaceId: NIC, ...over },
})
const deploy = (world: World, resources: { type: string; payload: unknown }[]) =>
  dispatch(world, registry, { type: DEPLOYMENT_COMMAND, caller: PLAYER, payload: { resources } })

const state = (w: World, rid: string) => azure.getResource(w, rid)?.provisioningState
const disk = id('Microsoft.Compute/disks', 'vm-web_OsDisk_1')

describe('multi-resource deployment (ARM-15s)', () => {
  it('validates writes in order, so the NIC may reference the new public IP and the VM the new NIC', () => {
    const { world, outcome } = deploy(withSubnets(), [pip, nic, vm()])
    expect(outcome.status).toBe('accepted')
    for (const r of [PIP, NIC, VM, disk]) expect(state(world, r)).toBe('Creating')
    const d = Object.values(world.deployments).find(x => x.provisioningState === 'Running')!
    expect(d.operations.map(o => o.targetResourceId)).toEqual([PIP, NIC, VM])
    expect(d.name).toMatch(/^vm-web-\d{14}$/)
    // Only the first operation has started.
    expect(world.activityLog.at(-1)).toMatchObject({ status: 'Started', resourceId: PIP, correlationId: d.correlationId })
  })

  it('runs the operations one after another in dependency order (ARM-8), each logged with the deployment\'s correlation ID', () => {
    const { world } = deploy(withSubnets(), [pip, nic, vm()])
    const d = Object.values(world.deployments).find(x => x.provisioningState === 'Running')!
    const [p, n, v] = d.operations
    expect(n!.startsAt).toBe(p!.endsAt)
    expect(v!.startsAt).toBe(n!.endsAt)
    expect(v!.endsAt - p!.startsAt).toBe(azure.PROVISIONING_MS['arm/publicIPAddresses/write']! + azure.PROVISIONING_MS['arm/networkInterfaces/write']! + azure.PROVISIONING_MS['arm/virtualMachines/write']!)

    const afterPip = step(world, Math.ceil(p!.endsAt / TICK_MS) * TICK_MS - world.clock.now)
    expect(state(afterPip, PIP)).toBe('Succeeded')
    expect(state(afterPip, NIC)).toBe('Creating')
    expect(afterPip.activityLog.slice(-2).map(e => [e.status, e.resourceId])).toEqual([['Succeeded', PIP], ['Started', NIC]])

    const done = settle(world)
    for (const r of [PIP, NIC, VM, disk]) expect(state(done, r)).toBe('Succeeded')
    expect(done.deployments[d.id]?.provisioningState).toBe('Succeeded')
    const events = done.activityLog.filter(e => e.correlationId === d.correlationId)
    expect(events.map(e => `${e.status}:${e.resourceId}`)).toEqual([
      `Started:${PIP}`, `Succeeded:${PIP}`, `Started:${NIC}`, `Succeeded:${NIC}`, `Started:${VM}`, `Succeeded:${VM}`,
    ])
    expect(azure.ipConfigurationsOf(azure.getResource(done, NIC)!)[0]?.properties.publicIPAddress?.id.toLowerCase()).toBe(PIP.toLowerCase())
  })

  it('one refused write refuses the whole deployment and leaves nothing behind (Review + create shows the same refusal)', () => {
    const w = withSubnets()
    const resources = [pip, nic, vm({ adminUsername: 'admin' })]
    const { world, outcome } = deploy(w, resources)
    if (outcome.status !== 'refused') throw new Error('expected a refusal')
    expectRule(outcome.refusal, 'VM-2')
    expect(world.tenant).toBe(w.tenant)
    expect(world.deployments).toBe(w.deployments)
    expect(world.activityLog.slice(-2).map(e => [e.status, e.resourceId])).toEqual([['Started', VM], ['Failed', VM]])
    expect(dryRun(w, registry, { type: DEPLOYMENT_COMMAND, caller: PLAYER, payload: { resources } })).toEqual(outcome.refusal)
  })

  it('a reference to a resource of another running deployment is still refused as not modelled (ARM-11u)', () => {
    const first = deploy(withSubnets(), [pip]).world
    const { outcome } = deploy(first, [nic])
    if (outcome.status !== 'refused') throw new Error('expected a refusal')
    expectRule(outcome.refusal, 'ARM-11u', 'not-modelled')
  })

  it('an empty deployment or a non-write inside one is invalid', () => {
    expect(deploy(withSubnets(), []).outcome).toMatchObject({ status: 'refused', refusal: { kind: 'invalid', code: 'engine/empty-deployment' } })
    expect(deploy(withSubnets(), [{ type: 'scenario/addSubscription', payload: { subscriptionId: 'x', displayName: 'x' } }]).outcome).toMatchObject({ status: 'refused', refusal: { kind: 'invalid', code: 'engine/not-a-write' } })
  })
})
