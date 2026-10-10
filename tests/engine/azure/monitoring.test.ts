import { describe, expect, it } from 'vitest'
import { azure, loadWorld, saveWorld, step, type World } from '../../../src/engine/index.ts'
import {
  ALERT_RULE, COMPONENT, expectRule, JONAS, lastWrite, NSG_DATA, NSG_GAME, ok, pixelForgeMonitored, pixelForgeWithApps, refused, RG,
  securityRule, start, SUB, WEBTEST, webTestSettings, WORKSPACE,
} from './fixtures.ts'

const MIN = 60_000
/** Advance to the next whole sim minute, then `n` more. */
const minutes = (w: World, n: number) => step(w, Math.ceil(w.clock.now / MIN) * MIN - w.clock.now + n * MIN)
const results = (w: World) => azure.resultsOf(w, WEBTEST)
const alerts = (w: World) => w.alerts.fired.filter(a => azure.sameName(a.alertRuleId, ALERT_RULE))
const base = { subscriptionId: SUB, resourceGroupName: RG, location: 'westeurope' }
const testWrite = (w: World, settings: Record<string, unknown>, name = 'game-api-health') =>
  ({ ...base, name, componentId: COMPONENT, settings: webTestSettings(w, settings) })
/** Jonas's incident: deny everything from the internet into snet-game, above Allow-HTTPS. */
const denyInternet = (w: World) => securityRule(w, NSG_GAME, 'Deny-Internet-Inbound', { priority: 100, access: 'Deny', protocol: '*', destinationPortRange: '*' }, JONAS)

describe('Log Analytics workspace and Application Insights (MON-5, MON-14..16)', () => {
  it('a workspace is PerGB2018 with 30-day retention and is a logged, provisioned write', () => {
    const w = start(pixelForgeWithApps(), 'arm/workspaces/write', { ...base, name: 'log-pixelforge-prod' })
    expect(azure.getResource(w, WORKSPACE)?.provisioningState).toBe('Creating')
    expect(lastWrite(w).at(-1)?.operationName).toBe('Microsoft.OperationalInsights/workspaces/write')
    const done = step(w, azure.PROVISIONING_MS['arm/workspaces/write']!)
    expect(azure.getResource(done, WORKSPACE)).toMatchObject({ provisioningState: 'Succeeded', properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 } })
  })

  it('workspace names follow NAME-2', () => {
    expectRule(refused(pixelForgeWithApps(), 'arm/workspaces/write', { ...base, name: 'log' }), 'NAME-2')
    expectRule(refused(pixelForgeWithApps(), 'arm/workspaces/write', { ...base, name: 'log_pixelforge' }), 'NAME-2')
  })

  it('Application Insights is workspace-based: no workspace, no component (MON-5, MON-15)', () => {
    let w = pixelForgeWithApps()
    expectRule(refused(w, 'arm/components/write', { ...base, name: 'appi', workspaceResourceId: '' }), 'MON-15')
    expect(refused(w, 'arm/components/write', { ...base, name: 'appi', workspaceResourceId: WORKSPACE })).toMatchObject({ kind: 'invalid', code: 'arm/not-found' })
    w = ok(w, 'arm/workspaces/write', { ...base, name: 'log-pixelforge-prod' })
    w = ok(w, 'arm/components/write', { ...base, name: 'appi-pixelforge-prod', workspaceResourceId: WORKSPACE })
    expect(azure.getResource(w, COMPONENT)).toMatchObject({
      kind: 'web', properties: { Application_Type: 'web', Flow_Type: 'Bluefield', Request_Source: 'rest', WorkspaceResourceId: WORKSPACE },
    })
    expect(azure.dependenciesOf(w, COMPONENT)).toEqual([{ from: COMPONENT, to: WORKSPACE, kind: 'workspace' }])
    expectRule(refused(w, 'arm/components/write', { ...base, name: 'appi/bad', workspaceResourceId: WORKSPACE }), 'NAME-3')
  })
})

describe('standard availability tests (MON-17, MON-25s)', () => {
  it('are stored ARM-shaped and linked to Application Insights by the hidden-link tag', () => {
    const w = pixelForgeMonitored()
    const test = azure.getResource(w, WEBTEST)
    expect(test).toMatchObject({
      kind: 'standard',
      tags: { [`hidden-link:${COMPONENT}`]: 'Resource' },
      properties: {
        Name: 'game-api-health', SyntheticMonitorId: 'game-api-health', Kind: 'standard', Enabled: true, Frequency: 300, Timeout: 30,
        Locations: [{ Id: 'emea-nl-ams-azr' }, { Id: 'emea-gb-db3-azr' }, { Id: 'emea-fr-pra-edge' }, { Id: 'emea-ru-msa-edge' }, { Id: 'us-va-ash-azr' }],
        Request: { HttpVerb: 'GET' }, ValidationRules: { ExpectedHttpStatusCode: 200, SSLCheck: false },
      },
    })
    expect(azure.dependenciesOf(w, WEBTEST)).toEqual([{ from: WEBTEST, to: COMPONENT, kind: 'component' }])
    expect(azure.dependenciesOf(w, ALERT_RULE)).toEqual([{ from: ALERT_RULE, to: WEBTEST, kind: 'webTest' }])
  })

  it('refuse what Azure refuses and what the sim does not model', () => {
    const w = pixelForgeMonitored()
    const no = (settings: Record<string, unknown>, ruleId: string, kind: 'rule' | 'not-modelled' = 'rule', name?: string) =>
      expectRule(refused(w, 'arm/webtests/write', testWrite(w, settings, name)), ruleId, kind)
    no({ RequestUrl: 'ftp://example' }, 'MON-19')
    no({ RequestUrl: 'https://play.pixelforge.example/health' }, 'MON-25s', 'not-modelled')
    no({ Locations: [] }, 'MON-2')
    no({ Locations: Array.from({ length: 17 }, () => 'emea-nl-ams-azr') }, 'MON-2')
    no({ Locations: ['westeurope'] }, 'MON-18')
    no({ Frequency: 120 }, 'MON-25s', 'not-modelled')
    no({ Timeout: 45 }, 'MON-25s', 'not-modelled')
    no({ SSLCheck: true }, 'MON-25s', 'not-modelled')
    no({}, 'NAME-5s', 'not-modelled', 'game_api')
  })

  it('a PUT replaces the settings, e.g. disabling the test', () => {
    let w = pixelForgeMonitored()
    w = ok(w, 'arm/webtests/write', testWrite(w, { Enabled: false }))
    expect(azure.webTestView(azure.getResource(w, WEBTEST)!).enabled).toBe(false)
    const before = results(w).length
    expect(results(minutes(w, 10)).length).toBe(before)
  })
})

describe('test runs come from the flow evaluator and the app (MON-26s)', () => {
  it('five locations every 300 s: one run a minute, staggered, all passing while healthy', () => {
    const w = minutes(pixelForgeMonitored(), 10)
    const last5 = results(w).slice(-5)
    expect(last5.map(r => r.TimeGenerated % MIN)).toEqual([0, 0, 0, 0, 0])
    expect(new Set(last5.map(r => r.Location))).toEqual(new Set(['West Europe', 'North Europe', 'France Central', 'UK South', 'East US']))
    expect(last5.every(r => r.Success && r.Message === 'Passed: 200 OK.' && r.Name === 'game-api-health')).toBe(true)
    // Each location runs once per Frequency.
    const ams = results(w).filter(r => r.Location === 'West Europe').map(r => r.TimeGenerated)
    expect(ams.slice(1).map((t, i) => t - ams[i]!)).toEqual(ams.slice(1).map(() => 300_000))
    expect(azure.availabilityPercent(results(w))).toBe(100)
  })

  it('an NSG deny on the internet path makes every location time out', () => {
    const w = minutes(denyInternet(pixelForgeMonitored()), 6)
    const last5 = results(w).slice(-5)
    expect(last5.every(r => !r.Success)).toBe(true)
    expect(last5[0]).toMatchObject({ DurationMs: 30_000 })
    expect(last5[0]?.Message).toMatch(/^Timed out after 30 s: no response from \d+\.\d+\.\d+\.\d+:443\.$/)
  })

  it('a degraded game API answers 503: the test fails on the status code', () => {
    const w = minutes(securityRule(pixelForgeMonitored(), NSG_DATA, 'Deny-Postgres', { priority: 150, access: 'Deny', sourceAddressPrefix: '10.40.1.0/24', destinationPortRange: '5432' }), 6)
    const last = results(w).at(-1)
    expect(last).toMatchObject({ Success: false, Message: 'Expected status code 200, got 503 Service Unavailable.' })
  })

  it('a URL with no web server behind it fails fast', () => {
    let w = pixelForgeMonitored()
    w = ok(w, 'arm/webtests/write', testWrite(w, { RequestUrl: webTestSettings(w).RequestUrl.replace('https://', 'http://') }))
    w = securityRule(w, NSG_GAME, 'Allow-HTTP', { priority: 220, destinationPortRange: '80' })
    const last = results(minutes(w, 6)).at(-1)
    expect(last?.Success).toBe(false)
    expect(last?.Message).toMatch(/^Connection failed: no web server answers HTTP on .*:80\.$/)
  })
})

describe('availability alerts: fired and resolved (MON-23, MON-24, MON-28s)', () => {
  it('fire once when 3 of 5 locations fail, stay fired while down, resolve after three clear checks', () => {
    let w = minutes(pixelForgeMonitored(), 6)
    expect(alerts(w)).toEqual([])
    w = denyInternet(w)
    w = minutes(w, 1)
    expect(alerts(w)).toEqual([]) // two locations have failed so far
    w = minutes(w, 1)
    expect(alerts(w)).toHaveLength(1)
    expect(alerts(w)[0]).toMatchObject({ monitorCondition: 'Fired', severity: 1, userResponse: 'New', alertRuleName: 'alert-game-api-availability' })
    expect(alerts(w)[0]?.failedLocations).toHaveLength(3)
    expect(alerts(minutes(w, 10))).toHaveLength(1) // state based: no new alert while it stays down

    w = ok(minutes(w, 10), 'arm/securityRules/delete', { securityRuleId: `${NSG_GAME}/securityRules/Deny-Internet-Inbound` }, JONAS)
    let resolvedAt: number | undefined
    for (let i = 0; i < 8 && resolvedAt === undefined; i++) {
      w = minutes(w, 1)
      resolvedAt = alerts(w)[0]?.resolvedAt
    }
    expect(alerts(w)[0]).toMatchObject({ monitorCondition: 'Resolved' })
    expect(alerts(w)).toHaveLength(1)
    // Three clear checks after the failures fell below the threshold.
    expect(alerts(w)[0]?.clearChecks).toBe(3)
  })

  it('with autoMitigate off the alert stays fired', () => {
    let w = denyInternet(minutes(pixelForgeMonitored({ autoMitigate: false }), 6))
    w = minutes(w, 5)
    w = ok(w, 'arm/securityRules/delete', { securityRuleId: `${NSG_GAME}/securityRules/Deny-Internet-Inbound` }, JONAS)
    w = minutes(w, 15)
    expect(alerts(w)).toHaveLength(1)
    expect(alerts(w)[0]?.monitorCondition).toBe('Fired')
  })

  it('alert rules follow MON-22 and the sim choices', () => {
    const w = pixelForgeMonitored()
    const rule = (overrides: Record<string, unknown>) => ({
      ...base, name: 'alert-2', webTestId: WEBTEST, severity: 2, enabled: true, evaluationFrequency: 'PT1M', windowSize: 'PT5M',
      failedLocationCount: 3, autoMitigate: true, ...overrides,
    })
    expectRule(refused(w, 'arm/metricAlerts/write', rule({ severity: 5 })), 'MON-22')
    expectRule(refused(w, 'arm/metricAlerts/write', rule({ failedLocationCount: 0 })), 'MON-22')
    expectRule(refused(w, 'arm/metricAlerts/write', rule({ failedLocationCount: 6 })), 'MON-28s', 'not-modelled')
    expectRule(refused(w, 'arm/metricAlerts/write', rule({ evaluationFrequency: 'PT30S' })), 'MON-28s', 'not-modelled')
    expectRule(refused(w, 'arm/metricAlerts/write', rule({ name: 'alert:2' })), 'NAME-4')
    expect(azure.getResource(w, ALERT_RULE)).toMatchObject({
      location: 'global',
      properties: { scopes: [WEBTEST, COMPONENT], criteria: { 'odata.type': azure.WEBTEST_CRITERIA, webTestId: WEBTEST, componentId: COMPONENT, failedLocationCount: 3 } },
    })
  })

  it('save and load mid-incident changes nothing (determinism)', () => {
    const w = minutes(denyInternet(minutes(pixelForgeMonitored(), 6)), 2)
    const loaded = loadWorld(saveWorld(w))
    if (!loaded.ok) throw new Error(loaded.message)
    expect(minutes(loaded.world, 4)).toEqual(minutes(w, 4))
  })
})
