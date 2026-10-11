import { describe, expect, it } from 'vitest'
import { azure } from '../../src/engine/index.ts'
import { addressKind, childCommand, initialChild } from '../../src/ui/portal/create/childCommands.ts'
import { COMPONENT, NIC_GAME, NSG_DATA, NSG_GAME, pixelForgeMonitored, RG, SNET_DATA, SUB, VNET, WEBTEST } from '../engine/azure/fixtures.ts'

const world = pixelForgeMonitored()

describe('side pane forms (PORTAL-11, PORTAL-12, PORTAL-12s, PORTAL-17)', () => {
  it('Add inbound security rule: Source/Destination types map to the ARM address prefix', () => {
    const values = {
      ...initialChild('securityRule', { networkSecurityGroupId: NSG_GAME, direction: 'Inbound' }, world),
      sourceType: 'IP Addresses', source: '203.0.113.10', sourcePortRange: '*', destinationType: 'Any', destinationPortRange: '22',
      protocol: 'Tcp', access: 'Allow', priority: '110', name: 'Allow-SSH-Office', description: '',
    }
    expect(childCommand('securityRule', values)).toEqual({
      type: 'arm/securityRules/write',
      payload: {
        networkSecurityGroupId: NSG_GAME, name: 'Allow-SSH-Office',
        properties: { priority: 110, direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sourceAddressPrefix: '203.0.113.10', sourcePortRange: '*', destinationAddressPrefix: '*', destinationPortRange: '22' },
      },
    })
    const tag = childCommand('securityRule', { ...values, sourceType: 'Service Tag', sourceTag: 'Internet', description: 'Players' })
    expect(tag?.payload).toMatchObject({ properties: { sourceAddressPrefix: 'Internet', description: 'Players' } })
  })

  it('editing a rule reads its addresses back into the right type', () => {
    expect(addressKind('*')).toBe('Any')
    expect(addressKind('Internet')).toBe('Service Tag')
    expect(addressKind('10.40.1.0/24')).toBe('IP Addresses')
    const edit = initialChild('securityRule', { mode: 'edit', networkSecurityGroupId: NSG_GAME, name: 'r', sourceAddressPrefix: 'VirtualNetwork', destinationAddressPrefix: '10.40.2.4', priority: '200', direction: 'Inbound', access: 'Deny', protocol: '*', sourcePortRange: '*', destinationPortRange: '*' }, world)
    expect(edit).toMatchObject({ sourceType: 'Service Tag', sourceTag: 'VirtualNetwork', destinationType: 'IP Addresses', destination: '10.40.2.4' })
  })

  it('Add subnet and Associate subnet write the subnet', () => {
    expect(childCommand('subnet', { virtualNetworkId: VNET, name: 'snet-x', addressPrefix: '10.40.9.0/24', networkSecurityGroupId: '' })).toEqual({
      type: 'arm/subnets/write', payload: { virtualNetworkId: VNET, name: 'snet-x', addressPrefix: '10.40.9.0/24', networkSecurityGroupId: null },
    })
    const assoc = { ...initialChild('associateSubnet', { networkSecurityGroupId: NSG_DATA }, world), virtualNetworkId: VNET, subnetId: SNET_DATA }
    expect(childCommand('associateSubnet', assoc, world)).toEqual({
      type: 'arm/subnets/write', payload: { virtualNetworkId: VNET, name: 'snet-data', addressPrefix: '10.40.2.0/24', networkSecurityGroupId: NSG_DATA },
    })
  })

  it('Add Standard test lives with its Application Insights resource', () => {
    const values = { ...initialChild('webTest', { componentId: COMPONENT }, world), name: 'api-health', url: 'https://198.51.100.10/health' }
    const cmd = childCommand('webTest', values, world)
    expect(cmd?.payload).toMatchObject({ subscriptionId: SUB, resourceGroupName: RG, name: 'api-health', location: 'westeurope', componentId: COMPONENT })
    expect((cmd?.payload as { settings: Record<string, unknown> }).settings).toMatchObject({ Enabled: true, Frequency: 300, Timeout: 30, RetryEnabled: true, RequestUrl: 'https://198.51.100.10/health', ExpectedHttpStatusCode: 200 })
    expect((cmd?.payload as { settings: { Locations: string[] } }).settings.Locations).toHaveLength(5)
  })

  it('availability alert rule goes into the test resource group', () => {
    const values = { ...initialChild('metricAlert', { webTestId: WEBTEST }, world), name: 'alert-x' }
    expect(childCommand('metricAlert', values, world)?.payload).toMatchObject({
      subscriptionId: SUB, resourceGroupName: RG, name: 'alert-x', webTestId: WEBTEST, failedLocationCount: 3, severity: 1, evaluationFrequency: 'PT1M', windowSize: 'PT5M', autoMitigate: true, enabled: true,
    })
  })

  it('IP configuration pane changes the public IP only; the NSG stays a NIC-level setting (PORTAL-13)', () => {
    const nic = azure.getResource(world, NIC_GAME)!
    const current = azure.nicNsgId(nic)
    const values = { ...initialChild('networkInterface', { mode: 'edit', name: nic.name }, world, NIC_GAME), publicIPAddressId: '', networkSecurityGroupId: NSG_GAME }
    const payload = childCommand('networkInterface', values, world)?.payload as Record<string, unknown>
    expect(payload).toMatchObject({ name: 'nic-game-01', publicIPAddressId: null, subnetId: azure.ipConfigurationsOf(nic)[0]?.properties.subnet.id })
    expect(payload.networkSecurityGroupId).toBe(current ?? null)
  })
})
