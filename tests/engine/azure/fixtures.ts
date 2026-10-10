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

// ── The PixelForge slice ─────────────────────────────────────────────────────────────────────────

export const NSG_DATA = id(azure.NSG_TYPE, 'nsg-snet-data')
export const NIC_GAME = id(azure.NIC_TYPE, 'nic-game-01')
export const NIC_DB = id(azure.NIC_TYPE, 'nic-db-01')
export const VM_GAME = id(azure.VM_TYPE, 'vm-game-01')
export const VM_DB = id(azure.VM_TYPE, 'vm-db-01')
export const PIP_GAME = id(azure.PUBLIC_IP_TYPE, 'pip-game-01')
export const GAME_IP = '10.40.1.4'
export const DB_IP = '10.40.2.4'

/** Write an inbound TCP 443 allow-from-Internet rule, with `props` overriding any field. */
export const securityRule = (w: World, nsg: string, name: string, props: Record<string, unknown>, caller?: string) => ok(w, 'arm/securityRules/write', {
  networkSecurityGroupId: nsg, name,
  properties: { priority: 200, direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefix: 'Internet', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '443', ...props },
}, caller)

export const linuxVm = (w: World, name: string, nic: string) => ok(w, 'arm/virtualMachines/write', {
  subscriptionId: SUB, resourceGroupName: RG, name, location: 'westeurope', vmSize: 'Standard_B2s_v2',
  image: 'Ubuntu2204', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops', networkInterfaceId: nic,
})

/**
 * The PixelForge slice, built as the ticket asks: game VM with a public IP in snet-game (HTTPS allowed from the
 * internet), database VM in snet-data (5432 only from snet-game, other VNet traffic denied), one NSG per subnet.
 */
export function pixelForge(): World {
  let w = withSubnets()
  w = ok(w, 'arm/networkSecurityGroups/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'nsg-snet-data', location: 'westeurope' })
  w = securityRule(w, NSG_GAME, 'Allow-HTTPS', {})
  w = securityRule(w, NSG_DATA, 'Allow-Postgres-From-Game', { sourceAddressPrefix: '10.40.1.0/24', destinationPortRange: '5432' })
  w = securityRule(w, NSG_DATA, 'Deny-Other-VNet', { priority: 300, access: 'Deny', protocol: '*', sourceAddressPrefix: 'VirtualNetwork', destinationPortRange: '*' })
  w = ok(w, 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-game', addressPrefix: '10.40.1.0/24', networkSecurityGroupId: NSG_GAME })
  w = ok(w, 'arm/subnets/write', { virtualNetworkId: VNET, name: 'snet-data', addressPrefix: '10.40.2.0/24', networkSecurityGroupId: NSG_DATA })
  w = ok(w, 'arm/publicIPAddresses/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'pip-game-01', location: 'westeurope', sku: { name: 'Standard' }, publicIPAllocationMethod: 'Static' })
  w = ok(w, 'arm/networkInterfaces/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'nic-game-01', location: 'westeurope', subnetId: SNET_GAME, publicIPAddressId: PIP_GAME })
  w = ok(w, 'arm/networkInterfaces/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'nic-db-01', location: 'westeurope', subnetId: SNET_DATA })
  w = linuxVm(w, 'vm-game-01', NIC_GAME)
  return linuxVm(w, 'vm-db-01', NIC_DB)
}

/** pixelForge with the apps installed: game API on vm-game-01 (database at DB_IP), PostgreSQL on vm-db-01. */
export function pixelForgeWithApps(): World {
  let w = pixelForge()
  w = ok(w, 'scenario/setWorkload', { vmId: VM_DB, workload: { kind: 'postgres', port: 5432 } })
  return ok(w, 'scenario/setWorkload', { vmId: VM_GAME, workload: { kind: 'game-api', port: 443, database: { ip: DB_IP, port: 5432 } } })
}
