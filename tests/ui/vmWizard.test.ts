import { describe, expect, it } from 'vitest'
import { buildCommands, defaultPublicIpName, nicNameFor } from '../../src/ui/portal/create/commands.ts'
import { RG, SNET_GAME, SUB } from '../engine/azure/fixtures.ts'

describe('VM wizard defaults (PORTAL-20s)', () => {
  it('names the new public IP and network interface after the VM (made-up defaults); a typed public IP name wins', () => {
    expect(nicNameFor('vm-game-01')).toBe('vm-game-01-nic')
    expect(defaultPublicIpName({ name: 'vm-game-01' })).toBe('vm-game-01-ip')
    expect(defaultPublicIpName({ name: 'vm-game-01', publicIpName: 'pip-game' })).toBe('pip-game')
  })

  it('never gives the network interface its own NSG: NIC network security group is None (PORTAL-20s, PORTAL-19 Public inbound ports None)', () => {
    const [cmd] = buildCommands('virtualMachine', { subscriptionId: SUB, resourceGroupName: RG, name: 'vm-a', location: 'westeurope', subnetId: SNET_GAME, publicIp: 'new' })
    const { resources } = cmd?.payload as { resources: { type: string; payload: Record<string, unknown> }[] }
    expect(resources.find(r => r.type === 'arm/networkInterfaces/write')?.payload['networkSecurityGroupId']).toBeNull()
    expect(resources.some(r => r.type === 'arm/networkSecurityGroups/write')).toBe(false)
  })
})
