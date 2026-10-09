import { expect } from 'vitest'
import { azure, createRegistry, createWorld, dispatch, dryRun, step, TICK_MS, type Refusal, type World } from '../../../src/engine/index.ts'

export const SUB = '6b1c2a9e-0d3f-4c5a-9e7b-2f4d6a8c0e11'
export const PLAYER = 'engineer@pixelforge.example'
export const JONAS = 'jonas@contoso-security.example'
export const RG = 'rg-pixelforge-prod'

export const registry = createRegistry(azure.AZURE_COMMANDS)

export const rgId = (name = RG) => azure.resourceGroupId(SUB, name)
export const id = (type: string, ...names: string[]) => azure.resourceId(SUB, RG, type, ...names)
export const VNET = id(azure.VNET_TYPE, 'vnet-pixelforge')
export const SNET_GAME = `${VNET}/subnets/snet-game`
export const SNET_DATA = `${VNET}/subnets/snet-data`
export const NSG_GAME = id(azure.NSG_TYPE, 'nsg-snet-game')

/** Advance sim time until every running deployment has completed (ARM-12s). */
export function settle(world: World): World {
  const running = Object.values(world.deployments).filter(d => d.provisioningState === 'Running')
  if (running.length === 0) return world
  const last = Math.max(...running.map(d => d.endsAt))
  // Completion is seen at the first tick boundary at or after endsAt.
  return step(world, Math.ceil(last / TICK_MS) * TICK_MS - world.clock.now)
}

/** Dispatch without waiting: the write's deployment is still running afterwards. */
export function start(world: World, type: string, payload: unknown, caller = PLAYER): World {
  const { world: next, outcome } = dispatch(world, registry, { type, caller, payload })
  if (outcome.status !== 'accepted') throw new Error(`${type} refused: ${JSON.stringify(outcome.refusal)}`)
  return next
}

/** Dispatch, expect acceptance, and wait for the deployment to finish, as a player would. */
export function ok(world: World, type: string, payload: unknown, caller = PLAYER): World {
  return settle(start(world, type, payload, caller))
}

/** Dispatch and expect a refusal. Also checks that nothing but the activity log changed. */
export function refused(world: World, type: string, payload: unknown, caller = PLAYER): Refusal {
  const { world: next, outcome } = dispatch(world, registry, { type, caller, payload })
  if (outcome.status !== 'refused') throw new Error(`${type} was accepted, expected a refusal`)
  expect(next.tenant).toBe(world.tenant)
  expect(dryRun(world, registry, { type, caller, payload })).toEqual(outcome.refusal)
  return outcome.refusal
}

/** Asserts a refusal cites `ruleId` with the given kind. */
export function expectRule(refusal: Refusal, ruleId: string, kind: 'rule' | 'not-modelled' = 'rule') {
  expect(refusal.kind).toBe(kind)
  if (refusal.kind !== 'invalid') expect(refusal.ruleId).toBe(ruleId)
}

export function emptyWorld(): World {
  return ok(createWorld({ seed: 'azure-tests', epochMs: 0 }), 'scenario/addSubscription', {
    subscriptionId: SUB, displayName: 'PixelForge Production',
  })
}

/** Subscription + rg-pixelforge-prod (West Europe) + vnet-pixelforge 10.40.0.0/16. */
export function withVnet(): World {
  let w = emptyWorld()
  w = ok(w, 'arm/resourceGroups/write', { subscriptionId: SUB, name: RG, location: 'westeurope' })
  w = ok(w, 'arm/virtualNetworks/write', {
    subscriptionId: SUB, resourceGroupName: RG, name: 'vnet-pixelforge', location: 'westeurope', addressPrefixes: ['10.40.0.0/16'],
  })
  return w
}

/** withVnet + snet-game 10.40.1.0/24 + snet-data 10.40.2.0/24 + nsg-snet-game (not associated). */
export function withSubnets(): World {
  let w = withVnet()
  w = ok(w, 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.1.0/24' })
  w = ok(w, 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-data', addressPrefix: '10.40.2.0/24' })
  w = ok(w, 'arm/networkSecurityGroups/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'nsg-snet-game', location: 'westeurope' })
  return w
}

/** The last two activity log entries (Started + Succeeded/Failed of the latest write). */
export const lastWrite = (w: World) => w.activityLog.slice(-2)
