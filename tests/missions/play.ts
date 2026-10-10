import { azure, dispatch, hasRunningDeployments, step, TICK_MS, type Refusal, type World } from '../../src/engine/index.ts'
import { objectiveStatus, PIXELFORGE_LAUNCH_DAY, registryFor, startMission, systemsFor, OFFICE_IP } from '../../src/missions/index.ts'

/** Playing "PixelForge: Launch Day" headless, the way a player would: commands and time only. */

export const MISSION = PIXELFORGE_LAUNCH_DAY
export const registry = registryFor(MISSION)
export const systems = systemsFor(MISSION, registry)
export const SUB = MISSION.subscription.subscriptionId
export const PLAYER = 'engineer@pixelforge.example'
export const MINUTE = 60_000

export const begin = (seed = 'mission-test'): World => startMission(MISSION, seed, registry)
export const run = (world: World, ms: number): World => step(world, ms, systems)

/** Let every running deployment finish, with the mission running. */
export function settle(world: World): World {
  let w = world
  while (hasRunningDeployments(w)) w = run(w, TICK_MS)
  return w
}

/** A player (or scenario) command that must be accepted; waits for its deployment like a player would. */
export function act(world: World, type: string, payload: unknown, caller = PLAYER): World {
  const { world: next, outcome } = dispatch(world, registry, { type, caller, payload })
  if (outcome.status !== 'accepted') throw new Error(`${type} refused: ${JSON.stringify(outcome.refusal)}`)
  return settle(next)
}

export function refusal(world: World, type: string, payload: unknown, caller = PLAYER): Refusal {
  const { outcome } = dispatch(world, registry, { type, caller, payload })
  if (outcome.status !== 'refused') throw new Error(`${type} was accepted, expected a refusal`)
  return outcome.refusal
}

/** Run in one-minute steps until `done`, failing after `maxMinutes`. */
export function runUntil(world: World, done: (w: World) => boolean, maxMinutes: number, what: string): World {
  let w = world
  for (let i = 0; i < maxMinutes; i++) {
    if (done(w)) return w
    w = run(w, MINUTE)
  }
  if (done(w)) return w
  throw new Error(`Still waiting for ${what} after ${maxMinutes} sim minutes (stage ${w.mission?.stage})`)
}

export const stage = (w: World) => w.mission?.stage
export const failing = (w: World) => objectiveStatus(MISSION, w).filter(o => !o.ok)
export const objective = (w: World, id: string) => objectiveStatus(MISSION, w).find(o => o.id === id)

// ── Designs ────────────────────────────────────────────────────────────────────────────────────

export interface Design {
  rg: string
  vnet: string
  space: string
  gameSubnet: string
  dataSubnet: string
  /** Where the NSGs go. Both are valid (BOOTSTRAP_REPORT §G). */
  nsgOn: 'subnet' | 'nic'
  /** Inbound rules for the game side and the data side (NSG-11 properties, with names). */
  gameRules: { name: string; properties: Record<string, unknown> }[]
  dataRules: { name: string; properties: Record<string, unknown> }[]
  dbPublicIp: boolean
  locations: string[]
  vmSuffix: string
}

const rule = (name: string, priority: number, props: Record<string, unknown>) => ({
  name,
  properties: {
    priority, direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefix: 'Internet', sourcePortRange: '*',
    destinationAddressPrefix: '*', destinationPortRange: '443', ...props,
  },
})

/** BOOTSTRAP_REPORT §G, intended architecture. */
export const INTENDED: Design = {
  rg: 'rg-pixelforge-prod', vnet: 'vnet-pixelforge', space: '10.40.0.0/16', gameSubnet: '10.40.1.0/24', dataSubnet: '10.40.2.0/24', nsgOn: 'subnet',
  gameRules: [rule('Allow-HTTPS', 200, {}), rule('Allow-SSH-Office', 210, { sourceAddressPrefix: OFFICE_IP, destinationPortRange: '22' })],
  dataRules: [
    rule('Allow-Postgres-From-Game', 100, { sourceAddressPrefix: '10.40.1.0/24', destinationPortRange: '5432' }),
    rule('Deny-Other-VNet', 200, { access: 'Deny', protocol: '*', sourceAddressPrefix: 'VirtualNetwork', destinationPortRange: '*' }),
  ],
  dbPublicIp: false,
  locations: ['emea-nl-ams-azr', 'emea-gb-db3-azr', 'emea-fr-pra-edge', 'emea-ru-msa-edge', 'emea-se-sto-edge'],
  vmSuffix: '01',
}

/** A different but valid design: other names and ranges, NSGs on the NICs, other priorities. */
export const ALTERNATIVE: Design = {
  rg: 'pf-beta', vnet: 'beta-net', space: '172.16.0.0/16', gameSubnet: '172.16.10.0/24', dataSubnet: '172.16.20.0/24', nsgOn: 'nic',
  gameRules: [rule('https-in', 300, {}), rule('ssh-office', 310, { sourceAddressPrefix: `${OFFICE_IP}/32`, destinationPortRange: '22' })],
  dataRules: [
    rule('pg-from-game', 1000, { sourceAddressPrefix: '172.16.10.0/24', destinationPortRange: '5432' }),
    rule('no-vnet', 1100, { access: 'Deny', protocol: '*', sourceAddressPrefix: 'VirtualNetwork', destinationPortRange: '*' }),
  ],
  dbPublicIp: false,
  locations: ['emea-nl-ams-azr', 'emea-gb-db3-azr', 'us-va-ash-azr', 'apac-sg-sin-azr', 'emea-fr-pra-edge', 'latam-br-gru-edge'],
  vmSuffix: 'a',
}

/** Build a design end to end: network, VMs, apps, monitoring. Returns the world and the IDs a test needs. */
export function build(world: World, d: Design) {
  const loc = 'westeurope'
  const base = { subscriptionId: SUB, resourceGroupName: d.rg, location: loc }
  const id = (type: string, ...names: string[]) => azure.resourceId(SUB, d.rg, type, ...names)
  const vnetId = id(azure.VNET_TYPE, d.vnet)
  const gameNsg = id(azure.NSG_TYPE, 'nsg-game')
  const dataNsg = id(azure.NSG_TYPE, 'nsg-data')
  const vmGame = id(azure.VM_TYPE, `vm-game-${d.vmSuffix}`)
  const vmDb = id(azure.VM_TYPE, `vm-db-${d.vmSuffix}`)

  let w = act(world, 'arm/resourceGroups/write', { subscriptionId: SUB, name: d.rg, location: loc })
  w = act(w, 'arm/virtualNetworks/write', { ...base, name: d.vnet, addressPrefixes: [d.space] })
  w = act(w, 'arm/networkSecurityGroups/write', { ...base, name: 'nsg-game' })
  w = act(w, 'arm/networkSecurityGroups/write', { ...base, name: 'nsg-data' })
  for (const r of d.gameRules) w = act(w, 'arm/securityRules/write', { networkSecurityGroupId: gameNsg, ...r })
  for (const r of d.dataRules) w = act(w, 'arm/securityRules/write', { networkSecurityGroupId: dataNsg, ...r })
  const onSubnet = d.nsgOn === 'subnet'
  w = act(w, 'arm/subnets/write', { virtualNetworkId: vnetId, name: 'game', addressPrefix: d.gameSubnet, networkSecurityGroupId: onSubnet ? gameNsg : null })
  w = act(w, 'arm/subnets/write', { virtualNetworkId: vnetId, name: 'data', addressPrefix: d.dataSubnet, networkSecurityGroupId: onSubnet ? dataNsg : null })
  w = act(w, 'arm/publicIPAddresses/write', { ...base, name: 'pip-game', sku: { name: 'Standard' }, publicIPAllocationMethod: 'Static' })
  if (d.dbPublicIp) w = act(w, 'arm/publicIPAddresses/write', { ...base, name: 'pip-db', sku: { name: 'Standard' }, publicIPAllocationMethod: 'Static' })
  w = act(w, 'arm/networkInterfaces/write', {
    ...base, name: 'nic-game', subnetId: `${vnetId}/subnets/game`, publicIPAddressId: id(azure.PUBLIC_IP_TYPE, 'pip-game'),
    networkSecurityGroupId: onSubnet ? null : gameNsg,
  })
  w = act(w, 'arm/networkInterfaces/write', {
    ...base, name: 'nic-db', subnetId: `${vnetId}/subnets/data`, publicIPAddressId: d.dbPublicIp ? id(azure.PUBLIC_IP_TYPE, 'pip-db') : null,
    networkSecurityGroupId: onSubnet ? null : dataNsg,
  })
  for (const [name, nic] of [[`vm-game-${d.vmSuffix}`, 'nic-game'], [`vm-db-${d.vmSuffix}`, 'nic-db']] as const) {
    w = act(w, 'arm/virtualMachines/write', {
      ...base, name, vmSize: 'Standard_B2s_v2', image: 'Ubuntu2204', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops', networkInterfaceId: id(azure.NIC_TYPE, nic),
    })
  }
  w = run(w, 5_000)
  const dbIp = azure.privateIpOf(azure.getResource(w, id(azure.NIC_TYPE, 'nic-db'))!)
  const gameIp = String(azure.getResource(w, id(azure.PUBLIC_IP_TYPE, 'pip-game'))?.properties.ipAddress)
  // The client deploys its apps on the VMs the player names (Simulated app section, RUN-1s).
  w = act(w, 'scenario/setWorkload', { vmId: vmDb, workload: { kind: 'postgres', port: 5432 } }, 'scenario')
  w = act(w, 'scenario/setWorkload', { vmId: vmGame, workload: { kind: 'game-api', port: 443, database: { ip: dbIp, port: 5432 } } }, 'scenario')

  const workspace = id(azure.WORKSPACE_TYPE, 'log-pixelforge')
  const component = id(azure.COMPONENT_TYPE, 'appi-pixelforge')
  const test = id(azure.WEBTEST_TYPE, 'game-api-health')
  w = act(w, 'arm/workspaces/write', { ...base, name: 'log-pixelforge' })
  w = act(w, 'arm/components/write', { ...base, name: 'appi-pixelforge', workspaceResourceId: workspace })
  w = act(w, 'arm/webtests/write', {
    ...base, name: 'game-api-health', componentId: component,
    settings: { Enabled: true, Frequency: 300, Timeout: 30, RetryEnabled: true, Locations: d.locations, RequestUrl: `https://${gameIp}/health`, ExpectedHttpStatusCode: 200 },
  })
  w = act(w, 'arm/metricAlerts/write', {
    subscriptionId: SUB, resourceGroupName: d.rg, name: 'alert-game-api', webTestId: test, severity: 1, enabled: true,
    evaluationFrequency: 'PT1M', windowSize: 'PT5M', failedLocationCount: Math.max(1, d.locations.length - 2), autoMitigate: true,
  })
  return { world: w, vmGame, vmDb, gameNsg, dataNsg, gameIp, test }
}
