import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { azure, DEPLOYMENT_COMMAND, type World } from '../../src/engine/index.ts'
import { currentBuildStep, OFFICE_IP } from '../../src/missions/index.ts'
import { factIds } from '../support/facts.ts'
import { act, begin, build, INTENDED, MISSION, SUB } from './play.ts'

const FACTS = factIds(readFileSync(path.resolve(import.meta.dirname, '../../Docs/AZURE_FACTS.md'), 'utf8'))
const plan = MISSION.buildPlan!

describe('Guided build plan (D-8): the exact recipe', () => {
  it('belongs to the build stage, and every value gives a reason backed by rules in the register', () => {
    expect(MISSION.stages.some(s => s.id === plan.stage)).toBe(true)
    expect(new Set(plan.steps.map(s => s.id)).size).toBe(plan.steps.length)
    for (const step of plan.steps) {
      expect(step.settings.length, step.id).toBeGreaterThan(0)
      expect(step.portalPath.length, step.id).toBeGreaterThan(0)
      for (const s of step.settings) {
        expect(s.why.length, `${step.id}: ${s.label}`).toBeGreaterThan(0)
        expect(s.rules.length, `${step.id}: ${s.label}`).toBeGreaterThan(0)
        for (const r of s.rules) expect(FACTS.has(r), `${step.id}: ${s.label} → ${r}`).toBe(true)
      }
    }
  })

  it('nothing is done at the start: Mia\'s North Europe resources don\'t count', () => {
    expect(currentBuildStep(plan, begin())).toBe(0)
  })

  it('following the recipe ticks the steps in order', () => {
    const rg = 'rg-pixelforge-prod'
    const base = { subscriptionId: SUB, resourceGroupName: rg, location: 'westeurope' }
    const id = (type: string, ...names: string[]) => azure.resourceId(SUB, rg, type, ...names)
    const vnet = id(azure.VNET_TYPE, 'vnet-pixelforge-prod')
    const nsgGame = id(azure.NSG_TYPE, 'nsg-snet-game')
    const nsgData = id(azure.NSG_TYPE, 'nsg-snet-data')
    const rule = (nsg: string, name: string, props: Record<string, unknown>) => ({
      networkSecurityGroupId: nsg, name,
      properties: { direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourcePortRange: '*', destinationAddressPrefix: '*', ...props },
    })
    const vm = (name: string, subnet: string, publicIp: boolean) => ({
      resources: [
        ...(publicIp ? [{ type: 'arm/publicIPAddresses/write', payload: { ...base, name: `${name}-ip`, sku: { name: 'Standard', tier: 'Regional' }, publicIPAllocationMethod: 'Static', publicIPAddressVersion: 'IPv4' } }] : []),
        { type: 'arm/networkInterfaces/write', payload: { ...base, name: `${name}-nic`, subnetId: `${vnet}/subnets/${subnet}`, privateIPAllocationMethod: 'Dynamic', publicIPAddressId: publicIp ? id(azure.PUBLIC_IP_TYPE, `${name}-ip`) : null, networkSecurityGroupId: null } },
        { type: 'arm/virtualMachines/write', payload: { ...base, name, vmSize: 'Standard_B2s_v2', image: 'Ubuntu2204', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops', networkInterfaceId: id(azure.NIC_TYPE, `${name}-nic`) } },
      ],
    })
    const steps: [string, (w: World) => World][] = [
      ['resource-group', w => act(w, 'arm/resourceGroups/write', { subscriptionId: SUB, name: rg, location: 'westeurope' })],
      ['vnet', w => act(w, 'arm/virtualNetworks/write', { ...base, name: 'vnet-pixelforge-prod', addressPrefixes: ['10.40.0.0/16'] })],
      ['subnets', w => act(act(w, 'arm/subnets/write', { virtualNetworkId: vnet, name: 'snet-game', addressPrefix: '10.40.1.0/24' }), 'arm/subnets/write', { virtualNetworkId: vnet, name: 'snet-data', addressPrefix: '10.40.2.0/24' })],
      ['nsgs', w => act(act(w, 'arm/networkSecurityGroups/write', { ...base, name: 'nsg-snet-game' }), 'arm/networkSecurityGroups/write', { ...base, name: 'nsg-snet-data' })],
      ['game-rules', w => act(act(w, 'arm/securityRules/write', rule(nsgGame, 'Allow-HTTPS', { priority: 200, sourceAddressPrefix: 'Internet', destinationPortRange: '443' })),
        'arm/securityRules/write', rule(nsgGame, 'Allow-SSH-Office', { priority: 210, sourceAddressPrefix: OFFICE_IP, destinationPortRange: '22' }))],
      ['data-rules', w => act(act(w, 'arm/securityRules/write', rule(nsgData, 'Allow-Postgres-From-Game', { priority: 100, sourceAddressPrefix: '10.40.1.0/24', destinationPortRange: '5432' })),
        'arm/securityRules/write', rule(nsgData, 'Deny-VNet-Inbound', { priority: 200, access: 'Deny', protocol: '*', sourceAddressPrefix: 'VirtualNetwork', destinationPortRange: '*' }))],
      ['associate', w => act(act(w, 'arm/subnets/write', { virtualNetworkId: vnet, name: 'snet-game', addressPrefix: '10.40.1.0/24', networkSecurityGroupId: nsgGame }),
        'arm/subnets/write', { virtualNetworkId: vnet, name: 'snet-data', addressPrefix: '10.40.2.0/24', networkSecurityGroupId: nsgData })],
      ['game-vm', w => act(w, DEPLOYMENT_COMMAND, vm('vm-game-01', 'snet-game', true))],
      ['db-vm', w => act(w, DEPLOYMENT_COMMAND, vm('vm-db-01', 'snet-data', false))],
    ]
    let w = begin()
    for (const [i, [stepId, doIt]] of steps.entries()) {
      expect(plan.steps[currentBuildStep(plan, w)]?.id, `before ${stepId}`).toBe(stepId)
      w = doIt(w)
      expect(currentBuildStep(plan, w), `after ${stepId}`).toBe(i + 1)
    }
  })

  it('the full intended build finishes the plan', () => {
    expect(currentBuildStep(plan, build(begin(), INTENDED).world)).toBe(plan.steps.length)
  })
})
