import { describe, expect, it } from 'vitest'
import { azure, type World } from '../../../src/engine/index.ts'
import { deepFreeze } from '../../support/freeze.ts'
import { JONAS, NSG_GAME, id, ok, RG, SNET_GAME, SUB, VNET, withSubnets } from './fixtures.ts'

const NIC = id(azure.NIC_TYPE, 'nic-game-01')
const VM = id(azure.VM_TYPE, 'vm-game-01')
const NSG_NIC = id(azure.NSG_TYPE, 'nsg-nic-game')
const VM_IP = '10.40.1.4'
const PLAYER_IP = '198.51.100.77'
const OFFICE_IP = '203.0.113.10'

type RuleProps = Partial<azure.SecurityRuleProperties>
const addRule = (w: World, nsgId: string, name: string, props: RuleProps, caller?: string) =>
  ok(w, 'arm/securityRules/write', {
    networkSecurityGroupId: nsgId, name,
    properties: {
      priority: 200, direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefix: 'Internet', sourcePortRange: '*',
      destinationAddressPrefix: '*', destinationPortRange: '443', ...props,
    },
  }, caller)
const associateSubnet = (w: World, nsgId: string | null, subnet = 'snet-game', prefix = '10.40.1.0/24') =>
  ok(w, 'arm/subnets/write', { virtualNetworkId: VNET, name: subnet, addressPrefix: prefix, networkSecurityGroupId: nsgId })

/** VM + NIC (with public IP) in snet-game, no NSG associated anywhere yet. */
function base(nicNsg: string | null = null): World {
  let w = withSubnets()
  w = ok(w, 'arm/networkSecurityGroups/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'nsg-nic-game', location: 'westeurope' })
  w = ok(w, 'arm/publicIPAddresses/write', { subscriptionId: SUB, resourceGroupName: RG, name: 'pip-game-01', location: 'westeurope', sku: { name: 'Standard' }, publicIPAllocationMethod: 'Static' })
  w = ok(w, 'arm/networkInterfaces/write', {
    subscriptionId: SUB, resourceGroupName: RG, name: 'nic-game-01', location: 'westeurope', subnetId: SNET_GAME,
    publicIPAddressId: id(azure.PUBLIC_IP_TYPE, 'pip-game-01'), networkSecurityGroupId: nicNsg,
  })
  return ok(w, 'arm/virtualMachines/write', {
    subscriptionId: SUB, resourceGroupName: RG, name: 'vm-game-01', location: 'westeurope', vmSize: 'Standard_B2s_v2',
    image: 'Ubuntu2204', osDiskType: 'StandardSSD_LRS', adminUsername: 'pixelops', networkInterfaceId: NIC,
  })
}

const inbound = (remoteIp: string, localPort: number, protocol: azure.FlowProtocol = 'Tcp'): azure.NicFlow =>
  ({ nicId: NIC, direction: 'Inbound', protocol, localIp: VM_IP, localPort, remoteIp, remotePort: 50123 })
const outbound = (remoteIp: string, remotePort: number): azure.NicFlow =>
  ({ nicId: NIC, direction: 'Outbound', protocol: 'Tcp', localIp: VM_IP, localPort: 50123, remoteIp, remotePort })

/** "Allow via rule X at subnet", or the refusal's rule ID. */
function decide(w: World, flow: azure.NicFlow): string {
  const v = azure.evaluateFlow(w, flow)
  if (v.kind === 'refused') return v.refusal.kind === 'invalid' ? 'invalid' : `refused ${v.refusal.ruleId}`
  return `${v.access} ${v.stages.map(s => `${s.association}:${s.ruleName}`).join(' > ') || `(${v.basis})`}`
}

describe('flow evaluator: the four scenarios on Learn (NSG-7, NSG-8)', () => {
  it('VM1: a subnet NSG without a custom allow rule denies with DenyAllInbound', () => {
    const w = associateSubnet(base(), NSG_GAME)
    expect(decide(w, inbound(PLAYER_IP, 443))).toBe('Deny Subnet:DenyAllInbound')
  })

  it('VM2: only the subnet has an NSG, so its allow rule lets traffic in', () => {
    const w = associateSubnet(addRule(base(), NSG_GAME, 'Allow-HTTPS', {}), NSG_GAME)
    expect(decide(w, inbound(PLAYER_IP, 443))).toBe('Allow Subnet:Allow-HTTPS')
  })

  it('VM3: only the NIC has an NSG, traffic passes the subnet and the NIC NSG decides', () => {
    const w = addRule(base(NSG_NIC), NSG_NIC, 'Allow-HTTPS', {})
    expect(decide(w, inbound(PLAYER_IP, 443))).toBe('Allow NetworkInterface:Allow-HTTPS')
  })

  it('VM4: no NSG at all, so internet traffic is blocked (NSG-8, NW-7s) and other flows are not modelled (NSG-8u)', () => {
    expect(decide(base(), inbound(PLAYER_IP, 443))).toBe('Deny (NSG-8)')
    expect(decide(base(), inbound('10.40.2.4', 443))).toBe('refused NSG-8u')
  })

  it('both NSGs must allow inbound: the subnet allows, the NIC NSG denies (go-live failure G2)', () => {
    let w = associateSubnet(addRule(base(NSG_NIC), NSG_GAME, 'Allow-HTTPS', {}), NSG_GAME)
    expect(decide(w, inbound(PLAYER_IP, 443))).toBe('Deny Subnet:Allow-HTTPS > NetworkInterface:DenyAllInbound')
    w = addRule(w, NSG_NIC, 'Allow-HTTPS', {})
    expect(decide(w, inbound(PLAYER_IP, 443))).toBe('Allow Subnet:Allow-HTTPS > NetworkInterface:Allow-HTTPS')
  })
})

describe('flow evaluator: rule matching (NSG-1, NSG-11s, NSG-14, NSG-15)', () => {
  const sandbox = () => {
    let w = addRule(base(), NSG_GAME, 'Allow-HTTPS', {})
    w = addRule(w, NSG_GAME, 'Allow-SSH-Office', { priority: 210, sourceAddressPrefix: OFFICE_IP, destinationPortRange: '22' })
    w = addRule(w, NSG_GAME, 'Allow-Ephemeral', { priority: 220, sourceAddressPrefix: '192.0.2.0/24', destinationPortRange: '1024-65535', protocol: 'Udp' })
    return associateSubnet(w, NSG_GAME)
  }

  it('matches the source address: SSH only from the office', () => {
    expect(decide(sandbox(), inbound(OFFICE_IP, 22))).toBe('Allow Subnet:Allow-SSH-Office')
    expect(decide(sandbox(), inbound(PLAYER_IP, 22))).toBe('Deny Subnet:DenyAllInbound')
  })

  it('matches protocol and port ranges', () => {
    expect(decide(sandbox(), inbound(PLAYER_IP, 443, 'Udp'))).toBe('Deny Subnet:DenyAllInbound')
    expect(decide(sandbox(), inbound('192.0.2.9', 40000, 'Udp'))).toBe('Allow Subnet:Allow-Ephemeral')
    expect(decide(sandbox(), inbound('192.0.2.9', 1000, 'Udp'))).toBe('Deny Subnet:DenyAllInbound')
  })

  it('applies the default rules: VNet traffic is allowed by AllowVNetInBound', () => {
    expect(decide(sandbox(), inbound('10.40.2.4', 5432))).toBe('Allow Subnet:AllowVNetInBound')
  })

  it('treats 168.63.129.16 as both VirtualNetwork and AzureLoadBalancer (NSG-15), so priority decides (NSG-1)', () => {
    // The VirtualNetwork tag includes the host's virtual IP, so AllowVNetInBound (65000) matches a
    // health probe before AllowAzureLoadBalancerInBound (65001) is reached.
    expect(decide(sandbox(), inbound('168.63.129.16', 80))).toBe('Allow Subnet:AllowVNetInBound')
    const w = addRule(sandbox(), NSG_GAME, 'Deny-Probes', { priority: 300, access: 'Deny', protocol: '*', sourceAddressPrefix: 'AzureLoadBalancer', destinationPortRange: '*' })
    expect(decide(w, inbound('168.63.129.16', 80))).toBe('Deny Subnet:Deny-Probes')
    expect(decide(w, inbound('10.40.2.4', 80))).toBe('Allow Subnet:AllowVNetInBound')
  })

  it('does not guess about service tags for private addresses outside the VNet (NSG-15s)', () => {
    expect(decide(sandbox(), inbound('172.20.0.5', 443))).toBe('refused NSG-15s')
  })

  it('evaluates outbound NIC first, then subnet (NSG-7)', () => {
    let w = sandbox()
    expect(decide(w, outbound(PLAYER_IP, 443))).toBe('Allow Subnet:AllowInternetOutBound')
    w = addRule(w, NSG_GAME, 'Deny-Out-Web', { direction: 'Outbound', access: 'Deny', priority: 300, sourceAddressPrefix: '*', destinationAddressPrefix: 'Internet', destinationPortRange: '443' })
    expect(decide(w, outbound(PLAYER_IP, 443))).toBe('Deny Subnet:Deny-Out-Web')
    w = ok(w, 'arm/networkInterfaces/write', {
      subscriptionId: SUB, resourceGroupName: RG, name: 'nic-game-01', location: 'westeurope', subnetId: SNET_GAME,
      publicIPAddressId: id(azure.PUBLIC_IP_TYPE, 'pip-game-01'), networkSecurityGroupId: NSG_NIC,
    })
    expect(decide(w, outbound(PLAYER_IP, 443))).toBe('Deny NetworkInterface:AllowInternetOutBound > Subnet:Deny-Out-Web')
  })

  it('refuses malformed flows and does not change the world', () => {
    const w = deepFreeze(sandbox())
    expect(decide(w, { ...inbound(PLAYER_IP, 443), localIp: '10.40.1.99' })).toBe('invalid')
    expect(decide(w, inbound(PLAYER_IP, 70000))).toBe('invalid')
    expect(decide(w, inbound('not-an-ip', 443))).toBe('invalid')
    expect(decide(w, inbound(PLAYER_IP, 443))).toBe('Allow Subnet:Allow-HTTPS')
  })
})

describe('incident R1: a deny rule with a lower number (NSG-1)', () => {
  it('blocks new HTTPS connections until the rule is removed', () => {
    let w = associateSubnet(addRule(base(), NSG_GAME, 'Allow-HTTPS', {}), NSG_GAME)
    expect(decide(w, inbound(PLAYER_IP, 443))).toBe('Allow Subnet:Allow-HTTPS')
    w = addRule(w, NSG_GAME, 'Deny-Internet-Inbound', { priority: 100, access: 'Deny', protocol: '*', destinationPortRange: '*' }, JONAS)
    expect(decide(w, inbound(PLAYER_IP, 443))).toBe('Deny Subnet:Deny-Internet-Inbound')
    expect(w.activityLog.at(-1)?.caller).toBe(JONAS)
    w = ok(w, 'arm/securityRules/delete', { securityRuleId: `${NSG_GAME}/securityRules/Deny-Internet-Inbound` })
    expect(decide(w, inbound(PLAYER_IP, 443))).toBe('Allow Subnet:Allow-HTTPS')
  })
})

describe('IP flow verify (NW-1, NW-2, NW-5u, NW-6s)', () => {
  const world = () => associateSubnet(addRule(base(NSG_NIC), NSG_GAME, 'Allow-HTTPS', {}), NSG_GAME)
  const verify = (w: World, over: Partial<azure.IpFlowVerifyInput> = {}) => azure.ipFlowVerify(w, {
    vmId: VM, direction: 'Inbound', protocol: 'Tcp', localIp: VM_IP, localPort: 443, remoteIp: PLAYER_IP, remotePort: 50123, ...over,
  })

  it('reports Access denied with the rule and NSG; a default rule has no link', () => {
    expect(verify(world())).toMatchObject({ ok: true, access: 'Access denied', ruleName: 'DenyAllInbound', nsgName: 'nsg-nic-game', isDefaultRule: true })
  })

  it('reports the allowing rule of the last NSG evaluated', () => {
    const w = addRule(world(), NSG_NIC, 'Allow-HTTPS-Nic', {})
    expect(verify(w)).toMatchObject({ ok: true, access: 'Access allowed', ruleName: 'Allow-HTTPS-Nic', nsgId: NSG_NIC, isDefaultRule: false })
  })

  it('tests only TCP and UDP, needs the VM\'s own address and a running VM', () => {
    expect(verify(world(), { protocol: 'Icmp' as never })).toMatchObject({ ok: false, refusal: { kind: 'rule', ruleId: 'NW-2' } })
    expect(verify(world(), { localIp: '10.40.1.5' })).toMatchObject({ ok: false, refusal: { kind: 'invalid' } })
    const stopped = { ...world(), runtime: { [VM.toLowerCase()]: { health: 'unknown' as const, reasons: [], powerState: 'deallocated' as const } } }
    expect(verify(stopped)).toMatchObject({ ok: false, refusal: { kind: 'not-modelled', ruleId: 'NW-5u' } })
  })
})

describe('effective security rules (NW-4, VM-5)', () => {
  it('lists both NSGs with securityRules/ and defaultSecurityRules/ names', () => {
    const w = associateSubnet(addRule(base(NSG_NIC), NSG_GAME, 'Allow-HTTPS', {}), NSG_GAME)
    const result = azure.effectiveSecurityRules(w, NIC)
    if (!result.ok) throw new Error('expected rules')
    expect(result.nsgs.map(n => [n.association, n.nsgName])).toEqual([['NetworkInterface', 'nsg-nic-game'], ['Subnet', 'nsg-snet-game']])
    const subnetRules = result.nsgs[1]?.rules.filter(r => r.direction === 'Inbound').map(r => `${r.priority} ${r.name}`)
    expect(subnetRules).toEqual(['200 securityRules/Allow-HTTPS', '65000 defaultSecurityRules/AllowVNetInBound', '65001 defaultSecurityRules/AllowAzureLoadBalancerInBound', '65500 defaultSecurityRules/DenyAllInbound'])
  })

  it('needs an NSG and a running VM (VM-5)', () => {
    expect(azure.effectiveSecurityRules(base(), NIC)).toMatchObject({ ok: false, refusal: { ruleId: 'VM-5' } })
    const w = associateSubnet(base(), NSG_GAME)
    const stopped = { ...w, runtime: {} }
    expect(azure.effectiveSecurityRules(stopped, NIC)).toMatchObject({ ok: false, refusal: { ruleId: 'VM-5' } })
  })
})
