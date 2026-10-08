import { describe, expect, it } from 'vitest'
import { azure, type World } from '../../../src/engine/index.ts'
import { expectRule, JONAS, lastWrite, NSG_GAME, ok, refused, RG, SUB, withSubnets, withVnet } from './fixtures.ts'

type Props = Partial<azure.SecurityRuleProperties>
const HTTPS: azure.SecurityRuleProperties = {
  priority: 200, direction: 'Inbound', access: 'Allow', protocol: 'Tcp',
  sourceAddressPrefix: 'Internet', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '443',
}
const rule = (name: string, props: Props = {}) => ({ networkSecurityGroupId: NSG_GAME, name, properties: { ...HTTPS, ...props } })
const ruleId = (name: string) => `${NSG_GAME}/securityRules/${name}`
const withHttps = (): World => ok(withSubnets(), 'arm/securityRules/write', rule('Allow-HTTPS'))

describe('network security groups', () => {
  it('get the six default rules with the values on Learn (NSG-3, NSG-3a, NSG-3s)', () => {
    const nsg = azure.getResource(withSubnets(), NSG_GAME)
    const defaults = nsg?.properties.defaultSecurityRules as azure.DefaultSecurityRule[]
    expect(defaults.map(r => [r.name, r.direction, r.priority, r.access, r.sourceAddressPrefix, r.destinationAddressPrefix, r.protocol])).toEqual([
      ['AllowVNetInBound', 'Inbound', 65000, 'Allow', 'VirtualNetwork', 'VirtualNetwork', '*'],
      ['AllowAzureLoadBalancerInBound', 'Inbound', 65001, 'Allow', 'AzureLoadBalancer', '0.0.0.0/0', '*'],
      ['DenyAllInbound', 'Inbound', 65500, 'Deny', '0.0.0.0/0', '0.0.0.0/0', '*'],
      ['AllowVnetOutBound', 'Outbound', 65000, 'Allow', 'VirtualNetwork', 'VirtualNetwork', '*'],
      ['AllowInternetOutBound', 'Outbound', 65001, 'Allow', '0.0.0.0/0', 'Internet', '*'],
      ['DenyAllOutBound', 'Outbound', 65500, 'Deny', '0.0.0.0/0', '0.0.0.0/0', '*'],
    ])
    expect(defaults.every(r => r.sourcePortRange === '0-65535' && r.destinationPortRange === '0-65535')).toBe(true)
  })

  it('refuse invalid names (NSG-9) and do not model changing an existing NSG (ARM-4u)', () => {
    const nsg = (name: string) => ({ subscriptionId: SUB, resourceGroupName: RG, name, location: 'westeurope' })
    expectRule(refused(withVnet(), 'arm/networkSecurityGroups/write', nsg('nsg.')), 'NSG-9')
    expectRule(refused(withSubnets(), 'arm/networkSecurityGroups/write', nsg('NSG-SNET-GAME')), 'ARM-4u', 'not-modelled')
  })
})

describe('security rules', () => {
  it('are child resources written with Microsoft.Network/networkSecurityGroups/securityRules/write (NSG-13s, ARM-3s)', () => {
    const w = withHttps()
    expect(azure.getResource(w, ruleId('Allow-HTTPS'))).toMatchObject({ type: azure.SECURITY_RULE_TYPE, location: 'westeurope', properties: HTTPS })
    expect(lastWrite(w).map(e => e.operationName)).toEqual(Array(2).fill('Microsoft.Network/networkSecurityGroups/securityRules/write'))
    expect(azure.securityRulesOf(w, NSG_GAME).map(r => r.name)).toEqual(['Allow-HTTPS'])
  })

  it('need a priority from 100 to 4096 (NSG-1)', () => {
    for (const priority of [99, 4097, 150.5]) expectRule(refused(withSubnets(), 'arm/securityRules/write', rule('r', { priority })), 'NSG-1')
    ok(withSubnets(), 'arm/securityRules/write', rule('lowest', { priority: 100 }))
    ok(withSubnets(), 'arm/securityRules/write', rule('highest', { priority: 4096 }))
  })

  it('refuse a second rule with the same priority in the same direction (NSG-2, NSG-2s)', () => {
    expectRule(refused(withHttps(), 'arm/securityRules/write', rule('Allow-SSH', { destinationPortRange: '22' })), 'NSG-2')
  })

  it('do not guess about the same priority in the other direction (NSG-2u)', () => {
    expectRule(refused(withHttps(), 'arm/securityRules/write', rule('Out', { direction: 'Outbound' })), 'NSG-2u', 'not-modelled')
  })

  it('validate direction, action, protocol and description (NSG-11)', () => {
    const bad: Props[] = [
      { direction: 'Both' as never }, { access: 'Block' as never }, { protocol: 'TCP' as never }, { description: 'x'.repeat(141) },
    ]
    for (const props of bad) expectRule(refused(withSubnets(), 'arm/securityRules/write', rule('r', props)), 'NSG-11')
    for (const protocol of ['*', 'Tcp', 'Udp', 'Icmp', 'Esp', 'Ah'] as const) ok(withSubnets(), 'arm/securityRules/write', rule('r', { protocol }))
  })

  it('accept *, a port or a range from 0 to 65535 (NSG-11, NSG-11s)', () => {
    for (const destinationPortRange of ['*', '0', '443', '1024-65535']) ok(withSubnets(), 'arm/securityRules/write', rule('r', { destinationPortRange }))
    for (const destinationPortRange of ['65536', 'https', '', '-1']) {
      expectRule(refused(withSubnets(), 'arm/securityRules/write', rule('r', { destinationPortRange })), 'NSG-11')
    }
    expectRule(refused(withSubnets(), 'arm/securityRules/write', rule('r', { destinationPortRange: '80,443' })), 'NSG-11s', 'not-modelled')
    expectRule(refused(withSubnets(), 'arm/securityRules/write', rule('r', { destinationPortRange: '500-100' })), 'NSG-11s', 'not-modelled')
  })

  it('accept *, the three default service tags, an address or a CIDR block (NSG-5, NSG-11, NSG-11s)', () => {
    for (const sourceAddressPrefix of ['*', 'Internet', 'VirtualNetwork', 'AzureLoadBalancer', '203.0.113.10', '203.0.113.10/32', '10.40.1.0/24']) {
      ok(withSubnets(), 'arm/securityRules/write', rule('r', { sourceAddressPrefix }))
    }
    expectRule(refused(withSubnets(), 'arm/securityRules/write', rule('r', { sourceAddressPrefix: 'Storage' })), 'NSG-11s', 'not-modelled')
    expectRule(refused(withSubnets(), 'arm/securityRules/write', rule('r', { sourceAddressPrefix: '10.0.0.1-10.0.0.9' })), 'NSG-11s', 'not-modelled')
    expectRule(refused(withSubnets(), 'arm/securityRules/write', rule('r', { sourceAddressPrefix: '10.40.1.5/24' })), 'VNET-8u', 'not-modelled')
    expectRule(refused(withSubnets(), 'arm/securityRules/write', rule('r', { sourceAddressPrefix: '10.40.1/24' })), 'NSG-11')
  })

  it('refuse invalid names (NSG-6) and the read-only default rule names (NSG-13s)', () => {
    expectRule(refused(withSubnets(), 'arm/securityRules/write', rule('Allow HTTPS')), 'NSG-6')
    expectRule(refused(withSubnets(), 'arm/securityRules/write', rule('denyallinbound')), 'NSG-13s', 'not-modelled')
  })

  it('a deny rule with a lower number can be added by someone else, and shows in the activity log (incident R1)', () => {
    const w = ok(withHttps(), 'arm/securityRules/write', rule('Deny-Internet-Inbound', {
      priority: 100, access: 'Deny', protocol: '*', destinationPortRange: '*',
    }), JONAS)
    expect(lastWrite(w).map(e => [e.status, e.caller, e.resourceId])).toEqual([
      ['Started', JONAS, ruleId('Deny-Internet-Inbound')],
      ['Succeeded', JONAS, ruleId('Deny-Internet-Inbound')],
    ])
    expect(azure.getResource(w, ruleId('Deny-Internet-Inbound'))?.createdBy).toBe(JONAS)
  })

  it('are updated in place by writing the same name, keeping who created them (NSG-13s)', () => {
    let w = ok(withHttps(), 'arm/securityRules/write', rule('Deny-Internet-Inbound', { priority: 100, access: 'Deny', destinationPortRange: '*' }), JONAS)
    w = ok(w, 'arm/securityRules/write', rule('deny-internet-inbound', { priority: 4000, access: 'Deny', destinationPortRange: '*' }))
    const updated = azure.getResource(w, ruleId('Deny-Internet-Inbound'))
    expect(azure.ruleProperties(updated!).priority).toBe(4000)
    expect(updated?.createdBy).toBe(JONAS)
    expect(azure.securityRulesOf(w, NSG_GAME)).toHaveLength(2)
  })

  it('are removed with Microsoft.Network/networkSecurityGroups/securityRules/delete', () => {
    const w = ok(withHttps(), 'arm/securityRules/delete', { securityRuleId: ruleId('Allow-HTTPS') })
    expect(azure.getResource(w, ruleId('Allow-HTTPS'))).toBeUndefined()
    expect(lastWrite(w).map(e => e.operationName)).toEqual(Array(2).fill('Microsoft.Network/networkSecurityGroups/securityRules/delete'))
    expect(refused(w, 'arm/securityRules/delete', { securityRuleId: ruleId('Allow-HTTPS') }).kind).toBe('invalid')
  })
})
