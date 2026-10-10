import type { System, Tick } from '../clock.ts'
import type { CommandHandler, Refusal } from '../commands.ts'
import { isInProgress } from '../deployments.ts'
import { nextGuid } from '../ids.ts'
import { pushRing } from '../ringBuffer.ts'
import type { ArmId, AvailabilityResult, FiredAlert, Resource, World } from '../world.ts'
import { armKey, parseArmId, resourceId } from './armId.ts'
import { parseIPv4 } from './cidr.ts'
import { armWrite, checkRegion, checkScope, firstRefusal, getResource, missing, notModelled, putResource, resourcesOfType, rule, stamp } from './common.ts'
import { ipFlowVerify } from './flow.ts'
import { checkComponentName, checkMetricAlertName, checkWebTestName, checkWorkspaceName } from './names.ts'
import { ipConfigurationsOf, PUBLIC_IP_TYPE } from './networkInterfaces.ts'
import { powerStateOf } from './virtualMachines.ts'
import { NIC_TYPE } from './virtualNetworks.ts'
import { privateIpOf, vmOfNic, workloadOf } from './workloads.ts'

/**
 * Monitoring (step 8b): Log Analytics workspaces, workspace-based Application Insights, standard
 * availability tests and availability alert rules (MON-5 … MON-29s). Test results come from the flow
 * evaluator and the simulated apps (CLAUDE.md rule 5); the Availability metric is derived from them.
 */

export const WORKSPACE_TYPE = 'Microsoft.OperationalInsights/workspaces'
export const COMPONENT_TYPE = 'Microsoft.Insights/components'
export const WEBTEST_TYPE = 'Microsoft.Insights/webtests'
export const METRIC_ALERT_TYPE = 'Microsoft.Insights/metricAlerts'

const isType = (r: Resource | undefined, type: string): r is Resource => !!r && r.type.toLowerCase() === type.toLowerCase()

/** Test locations, display name → population name (MON-18, copied as published). */
export const TEST_LOCATIONS = [
  { id: 'emea-au-syd-edge', displayName: 'Australia East' },
  { id: 'latam-br-gru-edge', displayName: 'Brazil South' },
  { id: 'us-fl-mia-edge', displayName: 'Central US' },
  { id: 'apac-hk-hkn-azr', displayName: 'East Asia' },
  { id: 'us-va-ash-azr', displayName: 'East US' },
  { id: 'emea-ch-zrh-edge', displayName: 'France South (Formerly France Central)' },
  { id: 'emea-fr-pra-edge', displayName: 'France Central' },
  { id: 'apac-jp-kaw-edge', displayName: 'Japan East' },
  { id: 'emea-gb-db3-azr', displayName: 'North Europe' },
  { id: 'us-il-ch1-azr', displayName: 'North Central US' },
  { id: 'us-tx-sn1-azr', displayName: 'South Central US' },
  { id: 'apac-sg-sin-azr', displayName: 'Southeast Asia' },
  { id: 'emea-se-sto-edge', displayName: 'UK West' },
  { id: 'emea-nl-ams-azr', displayName: 'West Europe' },
  { id: 'us-ca-sjc-azr', displayName: 'West US' },
  { id: 'emea-ru-msa-edge', displayName: 'UK South' },
] as const

export const testLocationName = (id: string): string => TEST_LOCATIONS.find(l => l.id === id)?.displayName ?? id

/** The made-up source address of a test location, in 192.0.2.0/24 (MON-26s). */
export function testLocationIp(id: string): string {
  const i = TEST_LOCATIONS.findIndex(l => l.id === id)
  return `192.0.2.${10 + Math.max(i, 0)}`
}

/** Sim choices (MON-25s, MON-28s). */
export const TEST_FREQUENCIES = [300, 600, 900] as const
export const TEST_TIMEOUTS = [30, 60, 90, 120] as const
export const EVALUATION_FREQUENCIES = { PT1M: 60_000, PT5M: 300_000 } as const
export const WINDOW_SIZES = { PT5M: 300_000, PT15M: 900_000 } as const
export const WEBTEST_CRITERIA = 'Microsoft.Azure.Monitor.WebtestLocationAvailabilityCriteria'
const HIDDEN_LINK = 'hidden-link:'

/** Same resource already there: a second PUT isn't modelled for these types (ARM-4u, MON-15s). */
const noUpdate = (world: World, id: ArmId, what: string): Refusal | null =>
  getResource(world, id) ? notModelled('ARM-4u', `${what} already exists. Changing its settings isn't modelled yet.`) : null

// ── Log Analytics workspace ────────────────────────────────────────────────────────────────────

export interface WorkspaceWrite {
  subscriptionId: string
  resourceGroupName: string
  name: string
  location: string
}

const workspaceId = (p: WorkspaceWrite) => resourceId(p.subscriptionId, p.resourceGroupName, WORKSPACE_TYPE, p.name)

/** Create a Log Analytics workspace: PerGB2018, 30-day retention (MON-14, MON-14s, MON-16). */
export const writeWorkspace: CommandHandler<WorkspaceWrite> = {
  type: 'arm/workspaces/write',
  write: ({ payload }) => armWrite(WORKSPACE_TYPE, workspaceId(payload)),
  validate: (world, { payload }) => firstRefusal(
    () => checkScope(world, payload.subscriptionId, payload.resourceGroupName),
    () => checkWorkspaceName(payload.name),
    () => checkRegion(payload.location),
    () => noUpdate(world, workspaceId(payload), `Log Analytics workspace '${payload.name}'`),
  ),
  apply: (world, { payload, caller }) => putResource(world, stamp(world, caller, {
    id: workspaceId(payload), type: WORKSPACE_TYPE, name: payload.name, location: payload.location, tags: {},
    properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 },
  })),
}

// ── Application Insights ───────────────────────────────────────────────────────────────────────

export interface ComponentWrite {
  subscriptionId: string
  resourceGroupName: string
  name: string
  location: string
  /** The Log Analytics workspace the telemetry goes to (MON-5, MON-15). */
  workspaceResourceId: ArmId
}

const componentId = (p: ComponentWrite) => resourceId(p.subscriptionId, p.resourceGroupName, COMPONENT_TYPE, p.name)

/** Create a workspace-based Application Insights resource (MON-5, MON-15, MON-15s). */
export const writeComponent: CommandHandler<ComponentWrite> = {
  type: 'arm/components/write',
  write: ({ payload }) => armWrite(COMPONENT_TYPE, componentId(payload)),
  validate: (world, { payload }) => firstRefusal(
    () => checkScope(world, payload.subscriptionId, payload.resourceGroupName),
    () => checkComponentName(payload.name),
    () => checkRegion(payload.location),
    () => {
      if (!payload.workspaceResourceId) return rule('MON-15', 'Application Insights needs a Log Analytics workspace: classic (workspace-less) resources are retired.')
      const ws = getResource(world, payload.workspaceResourceId)
      if (!isType(ws, WORKSPACE_TYPE)) return missing(`Log Analytics workspace '${payload.workspaceResourceId}'`)
      return parseArmId(ws.id)?.subscriptionId === payload.subscriptionId
        ? null
        : notModelled('MON-5s', 'A workspace in another subscription isn\'t modelled.')
    },
    () => noUpdate(world, componentId(payload), `Application Insights '${payload.name}'`),
  ),
  apply: (world, { payload, caller }) => putResource(world, stamp(world, caller, {
    id: componentId(payload), type: COMPONENT_TYPE, kind: 'web', name: payload.name, location: payload.location, tags: {},
    properties: { Application_Type: 'web', Flow_Type: 'Bluefield', Request_Source: 'rest', WorkspaceResourceId: getResource(world, payload.workspaceResourceId)?.id ?? payload.workspaceResourceId },
  })),
}

/** The workspace an Application Insights resource sends its telemetry to. */
export const workspaceOfComponent = (component: Resource): ArmId | null =>
  typeof component.properties.WorkspaceResourceId === 'string' ? component.properties.WorkspaceResourceId : null

// ── Standard availability test ─────────────────────────────────────────────────────────────────

export interface WebTestSettings {
  Enabled: boolean
  /** Seconds between runs from each location (MON-17, MON-25s). */
  Frequency: number
  /** Seconds before a run counts as failed (MON-19). */
  Timeout: number
  RetryEnabled: boolean
  /** Population names (MON-18). */
  Locations: string[]
  RequestUrl: string
  ExpectedHttpStatusCode: number
  SSLCheck?: boolean
  ParseDependentRequests?: boolean
}

export interface WebTestWrite {
  subscriptionId: string
  resourceGroupName: string
  name: string
  location: string
  /** The Application Insights resource; stored as the `hidden-link` tag (MON-17). */
  componentId: ArmId
  settings: WebTestSettings
}

const webTestId = (p: WebTestWrite) => resourceId(p.subscriptionId, p.resourceGroupName, WEBTEST_TYPE, p.name)

export interface ParsedUrl {
  scheme: 'http' | 'https'
  host: string
  port: number
  path: string
}

/** `http(s)://<IPv4>[:port]/path` (MON-25s), or null. */
export function parseTestUrl(url: string): ParsedUrl | null {
  const m = /^(https?):\/\/([^/:?#]+)(?::(\d{1,5}))?(\/[^\s]*)?$/i.exec(url.trim())
  if (!m) return null
  const scheme = (m[1] ?? '').toLowerCase() as 'http' | 'https'
  const port = m[3] ? Number(m[3]) : scheme === 'https' ? 443 : 80
  if (port < 1 || port > 65535) return null
  return { scheme, host: m[2] ?? '', port, path: m[4] ?? '/' }
}

function checkWebTest(world: World, p: WebTestWrite): Refusal | null {
  const s = p.settings
  return firstRefusal(
    () => checkScope(world, p.subscriptionId, p.resourceGroupName),
    () => checkWebTestName(p.name),
    () => checkRegion(p.location),
    () => {
      const c = getResource(world, p.componentId)
      if (!isType(c, COMPONENT_TYPE)) return missing(`Application Insights '${p.componentId}'`)
      return parseArmId(c.id)?.subscriptionId === p.subscriptionId ? null : notModelled('MON-25s', 'Linking a test to Application Insights in another subscription isn\'t modelled.')
    },
    () => {
      const existing = getResource(world, webTestId(p))
      return existing && existing.location !== p.location
        ? notModelled('ARM-4u', `Availability test '${p.name}' is in ${existing.location}. Moving it isn't modelled.`)
        : null
    },
    () => {
      const url = parseTestUrl(s.RequestUrl)
      if (!url) return rule('MON-19', 'The URL must be an http:// or https:// address that\'s visible from the public internet.')
      return parseIPv4(url.host) === null
        ? notModelled('MON-25s', `The simulator has no DNS, so use the public IP address in the URL, e.g. https://198.51.100.10/health.`)
        : null
    },
    () => (s.Locations.length >= 1 && s.Locations.length <= 16 ? null : rule('MON-2', 'Pick between 1 and 16 test locations (at least five are recommended).')),
    () => {
      const unknown = s.Locations.find(l => !TEST_LOCATIONS.some(t => t.id === l))
      if (unknown !== undefined) return rule('MON-18', `'${unknown}' isn't a test location. Use the population names, e.g. emea-nl-ams-azr for West Europe.`)
      return new Set(s.Locations).size === s.Locations.length ? null : notModelled('MON-25s', 'Each location can be listed once.')
    },
    () => ((TEST_FREQUENCIES as readonly number[]).includes(s.Frequency) ? null : notModelled('MON-25s', `Test frequency: the simulator offers ${TEST_FREQUENCIES.map(f => `${f / 60} minutes`).join(', ')}.`)),
    () => ((TEST_TIMEOUTS as readonly number[]).includes(s.Timeout) ? null : notModelled('MON-25s', `Test timeout: the simulator offers ${TEST_TIMEOUTS.join(', ')} seconds.`)),
    () => (Number.isInteger(s.ExpectedHttpStatusCode) && s.ExpectedHttpStatusCode >= 100 && s.ExpectedHttpStatusCode <= 599
      ? null : rule('MON-19', 'The expected HTTP status code is a number from 100 to 599, usually 200.')),
    () => (s.SSLCheck ? notModelled('MON-25s', 'The simulator has no certificates, so the SSL certificate check isn\'t modelled.') : null),
    () => (s.ParseDependentRequests ? notModelled('MON-25s', 'Parsing dependent requests isn\'t modelled.') : null),
  )
}

/** Create or update a standard availability test (MON-1, MON-17, MON-25s). A PUT replaces its settings. */
export const writeWebTest: CommandHandler<WebTestWrite> = {
  type: 'arm/webtests/write',
  write: ({ payload }) => armWrite(WEBTEST_TYPE, webTestId(payload)),
  validate: (world, { payload }) => checkWebTest(world, payload),
  apply(world, { payload, caller }) {
    const s = payload.settings
    const component = getResource(world, payload.componentId)
    return putResource(world, stamp(world, caller, {
      id: webTestId(payload), type: WEBTEST_TYPE, kind: 'standard', name: payload.name, location: payload.location,
      tags: { [`${HIDDEN_LINK}${component?.id ?? payload.componentId}`]: 'Resource' },
      properties: {
        Name: payload.name, SyntheticMonitorId: payload.name, Kind: 'standard', Enabled: s.Enabled,
        Frequency: s.Frequency, Timeout: s.Timeout, RetryEnabled: s.RetryEnabled,
        Locations: s.Locations.map(Id => ({ Id })),
        Request: { RequestUrl: s.RequestUrl.trim(), HttpVerb: 'GET', ParseDependentRequests: false },
        ValidationRules: { ExpectedHttpStatusCode: s.ExpectedHttpStatusCode, SSLCheck: false },
      },
    }))
  },
}

/** A web test's settings as stored (MON-17). */
export interface WebTestView {
  name: string
  enabled: boolean
  frequencyMs: number
  timeoutMs: number
  locations: string[]
  url: string
  expectedStatus: number
  componentId: ArmId | null
}

export function webTestView(test: Resource): WebTestView {
  const p = test.properties as {
    Name?: string; Enabled?: boolean; Frequency?: number; Timeout?: number; Locations?: { Id: string }[]
    Request?: { RequestUrl?: string }; ValidationRules?: { ExpectedHttpStatusCode?: number }
  }
  const link = Object.keys(test.tags).find(k => k.toLowerCase().startsWith(HIDDEN_LINK))
  return {
    name: p.Name ?? test.name,
    enabled: p.Enabled !== false,
    frequencyMs: (p.Frequency ?? 300) * 1000,
    timeoutMs: (p.Timeout ?? 30) * 1000,
    locations: (p.Locations ?? []).map(l => l.Id),
    url: p.Request?.RequestUrl ?? '',
    expectedStatus: p.ValidationRules?.ExpectedHttpStatusCode ?? 200,
    componentId: link ? link.slice(HIDDEN_LINK.length) : null,
  }
}

// ── Metric alert rule (availability) ───────────────────────────────────────────────────────────

export interface MetricAlertWrite {
  subscriptionId: string
  resourceGroupName: string
  name: string
  webTestId: ArmId
  severity: number
  enabled: boolean
  evaluationFrequency: keyof typeof EVALUATION_FREQUENCIES
  windowSize: keyof typeof WINDOW_SIZES
  failedLocationCount: number
  autoMitigate: boolean
  description?: string
}

const metricAlertId = (p: MetricAlertWrite) => resourceId(p.subscriptionId, p.resourceGroupName, METRIC_ALERT_TYPE, p.name)

function checkMetricAlert(world: World, p: MetricAlertWrite): Refusal | null {
  return firstRefusal(
    () => checkScope(world, p.subscriptionId, p.resourceGroupName),
    () => checkMetricAlertName(p.name),
    () => {
      const test = getResource(world, p.webTestId)
      if (!isType(test, WEBTEST_TYPE)) return missing(`Availability test '${p.webTestId}'`)
      const view = webTestView(test)
      if (!view.componentId || !getResource(world, view.componentId)) return missing(`The Application Insights resource of '${test.name}'`)
      const n = view.locations.length
      if (!Number.isInteger(p.failedLocationCount) || p.failedLocationCount < 1) return rule('MON-22', 'The number of failed locations is a whole number, at least 1.')
      return p.failedLocationCount > n
        ? notModelled('MON-28s', `'${test.name}' runs from ${n} location${n === 1 ? '' : 's'}, so more than ${n} can never fail. The simulator doesn't guess what Azure does with that.`)
        : null
    },
    () => (Number.isInteger(p.severity) && p.severity >= 0 && p.severity <= 4 ? null : rule('MON-22', 'Severity is 0, 1, 2, 3 or 4.')),
    () => (p.evaluationFrequency in EVALUATION_FREQUENCIES ? null : notModelled('MON-28s', `Evaluation frequency: the simulator offers ${Object.keys(EVALUATION_FREQUENCIES).join(', ')}.`)),
    () => (p.windowSize in WINDOW_SIZES ? null : notModelled('MON-28s', `Window size: the simulator offers ${Object.keys(WINDOW_SIZES).join(', ')}.`)),
  )
}

/** Create or update an availability alert rule (MON-4, MON-22, MON-28s). */
export const writeMetricAlert: CommandHandler<MetricAlertWrite> = {
  type: 'arm/metricAlerts/write',
  write: ({ payload }) => armWrite(METRIC_ALERT_TYPE, metricAlertId(payload)),
  validate: (world, { payload }) => checkMetricAlert(world, payload),
  apply(world, { payload: p, caller }) {
    const test = getResource(world, p.webTestId)
    if (!test) return world
    const componentId = webTestView(test).componentId ?? ''
    return putResource(world, stamp(world, caller, {
      id: metricAlertId(p), type: METRIC_ALERT_TYPE, name: p.name, location: 'global', tags: {},
      properties: {
        description: p.description ?? '', severity: p.severity, enabled: p.enabled,
        scopes: [test.id, componentId], evaluationFrequency: p.evaluationFrequency, windowSize: p.windowSize,
        criteria: { 'odata.type': WEBTEST_CRITERIA, webTestId: test.id, componentId, failedLocationCount: p.failedLocationCount },
        autoMitigate: p.autoMitigate,
      },
    }))
  },
}

export interface MetricAlertView {
  severity: number
  enabled: boolean
  evaluationMs: number
  windowMs: number
  webTestId: ArmId
  failedLocationCount: number
  autoMitigate: boolean
  description: string
}

export function metricAlertView(alert: Resource): MetricAlertView {
  const p = alert.properties as {
    severity?: number; enabled?: boolean; evaluationFrequency?: string; windowSize?: string; autoMitigate?: boolean; description?: string
    criteria?: { webTestId?: string; failedLocationCount?: number }
  }
  return {
    severity: p.severity ?? 3,
    enabled: p.enabled !== false,
    evaluationMs: EVALUATION_FREQUENCIES[p.evaluationFrequency as keyof typeof EVALUATION_FREQUENCIES] ?? 60_000,
    windowMs: WINDOW_SIZES[p.windowSize as keyof typeof WINDOW_SIZES] ?? 300_000,
    webTestId: p.criteria?.webTestId ?? '',
    failedLocationCount: p.criteria?.failedLocationCount ?? 1,
    autoMitigate: p.autoMitigate !== false,
    description: p.description ?? '',
  }
}

// ── Running tests (MON-26s) ────────────────────────────────────────────────────────────────────

/** Remote port of a test request (made up, like APP_SOURCE_PORT). */
const TEST_SOURCE_PORT = 51000

export interface TestOutcome {
  Success: boolean
  DurationMs: number
  Message: string
}

/** The VM behind a public IP address, through the NIC that holds it. */
function targetOf(world: World, ip: string): { vm: Resource; nic: Resource } | null {
  const pip = resourcesOfType(world, PUBLIC_IP_TYPE).find(p => p.properties.ipAddress === ip && !isInProgress(p.provisioningState))
  if (!pip) return null
  const nic = resourcesOfType(world, NIC_TYPE).find(n => ipConfigurationsOf(n).some(c => c.properties.publicIPAddress && armKey(c.properties.publicIPAddress.id) === armKey(pip.id)))
  const vm = nic ? vmOfNic(world, nic) : undefined
  return nic && vm ? { vm, nic } : null
}

/** One request from one location, decided by the flow evaluator and the simulated app (MON-26s). */
export function runTest(world: World, test: WebTestView, locationId: string): TestOutcome {
  const url = parseTestUrl(test.url)
  const index = Math.max(0, TEST_LOCATIONS.findIndex(l => l.id === locationId))
  const timeout = (why: string): TestOutcome => ({ Success: false, DurationMs: test.timeoutMs, Message: `Timed out after ${test.timeoutMs / 1000} s: ${why}` })
  if (!url) return timeout('the URL isn\'t valid.')
  const where = `${url.host}:${url.port}`
  const target = targetOf(world, url.host)
  if (!target || powerStateOf(world, target.vm.id) !== 'running') return timeout(`no response from ${where}.`)
  const check = ipFlowVerify(world, {
    vmId: target.vm.id, direction: 'Inbound', protocol: 'Tcp', localIp: privateIpOf(target.nic), localPort: url.port,
    remoteIp: testLocationIp(locationId), remotePort: TEST_SOURCE_PORT,
  })
  if (!check.ok || check.access !== 'Access allowed') return timeout(`no response from ${where}.`)
  const fast = 40 + 7 * index
  const app = workloadOf(world, target.vm.id)
  if (app?.kind !== 'game-api' || app.port !== url.port || url.scheme !== 'https') {
    return { Success: false, DurationMs: fast, Message: `Connection failed: no web server answers ${url.scheme.toUpperCase()} on ${where}.` }
  }
  const service = world.runtime[armKey(target.vm.id)]?.service
  const status = service?.status === 'up' ? 200 : 503
  const text = status === 200 ? 'OK' : 'Service Unavailable'
  return status === test.expectedStatus
    ? { Success: true, DurationMs: fast + 60, Message: `Passed: ${status} ${text}.` }
    : { Success: false, DurationMs: fast + 60, Message: `Expected status code ${test.expectedStatus}, got ${status} ${text}.` }
}

/** When location `i` of `n` runs inside this tick, its run time; locations are staggered evenly (MON-26s). */
function runTimeIn(tick: Tick, frequencyMs: number, i: number, n: number): number | null {
  const offset = Math.floor((i * frequencyMs) / n)
  const k = Math.floor((tick.end - offset) / frequencyMs)
  const t = k * frequencyMs + offset
  return t > tick.start && t <= tick.end ? t : null
}

/** Availability system: runs every enabled test from each of its locations (MON-2, MON-26s). */
export const availabilitySystem: System = (world, tick) => {
  let buffer = world.telemetry.availability
  for (const test of resourcesOfType(world, WEBTEST_TYPE).sort((a, b) => armKey(a.id).localeCompare(armKey(b.id)))) {
    if (isInProgress(test.provisioningState)) continue
    const view = webTestView(test)
    if (!view.enabled) continue
    view.locations.forEach((loc, i) => {
      const t = runTimeIn(tick, view.frequencyMs, i, view.locations.length)
      if (t === null || t <= test.changedAt) return
      const outcome = runTest(world, view, loc)
      const row: AvailabilityResult = { TimeGenerated: t, Name: view.name, Location: testLocationName(loc), webTestId: test.id, ...outcome }
      buffer = pushRing(buffer, row)
    })
  }
  return buffer === world.telemetry.availability ? world : { ...world, telemetry: { ...world.telemetry, availability: buffer } }
}

/** Results of one test, oldest first. */
export const resultsOf = (world: World, testId: ArmId): AvailabilityResult[] =>
  world.telemetry.availability.items.filter(r => armKey(r.webTestId) === armKey(testId))

/** The Availability metric: percentage of successful runs (MON-21), or null without runs. */
export function availabilityPercent(results: readonly AvailabilityResult[]): number | null {
  if (results.length === 0) return null
  return (100 * results.filter(r => r.Success).length) / results.length
}

// ── Alerts (MON-23, MON-24, MON-28s) ───────────────────────────────────────────────────────────

/** Locations whose newest result in the window failed. */
export function failedLocations(world: World, test: Resource, end: number, windowMs: number): string[] {
  const view = webTestView(test)
  const inWindow = resultsOf(world, test.id).filter(r => r.TimeGenerated > end - windowMs && r.TimeGenerated <= end)
  return view.locations.map(testLocationName).filter(name => {
    const newest = inWindow.filter(r => r.Location === name).at(-1)
    return newest !== undefined && !newest.Success
  })
}

export const ALERT_HISTORY_LIMIT = 200

export const activeAlertOf = (world: World, ruleId: ArmId): FiredAlert | undefined =>
  world.alerts.fired.find(a => armKey(a.alertRuleId) === armKey(ruleId) && a.monitorCondition === 'Fired')

/** Alert system: evaluates availability alert rules on their schedule; fires and resolves alerts. */
export const alertSystem: System = (world, tick) => {
  let fired = world.alerts.fired
  let ids = world.rng.ids
  for (const alertRule of resourcesOfType(world, METRIC_ALERT_TYPE).sort((a, b) => armKey(a.id).localeCompare(armKey(b.id)))) {
    if (isInProgress(alertRule.provisioningState)) continue
    const view = metricAlertView(alertRule)
    if (!view.enabled || tick.end % view.evaluationMs !== 0 || tick.end <= alertRule.changedAt) continue
    const test = getResource(world, view.webTestId)
    if (!test) continue
    const failed = failedLocations(world, test, tick.end, view.windowMs)
    const met = failed.length >= view.failedLocationCount
    const active = fired.find(a => armKey(a.alertRuleId) === armKey(alertRule.id) && a.monitorCondition === 'Fired')
    if (met && !active) {
      const [id, next] = nextGuid(ids)
      ids = next
      const alert: FiredAlert = {
        id, alertRuleId: alertRule.id, alertRuleName: alertRule.name, severity: view.severity, description: view.description,
        monitorCondition: 'Fired', userResponse: 'New', firedAt: tick.end, failedLocations: failed, clearChecks: 0,
      }
      fired = [alert, ...fired].slice(0, ALERT_HISTORY_LIMIT)
    } else if (active && (met ? active.clearChecks !== 0 : true)) {
      const clearChecks = met ? 0 : active.clearChecks + 1
      const resolved = clearChecks >= 3 && view.autoMitigate
      const updated: FiredAlert = resolved ? { ...active, clearChecks, monitorCondition: 'Resolved', resolvedAt: tick.end } : { ...active, clearChecks }
      fired = fired.map(a => (a === active ? updated : a))
    }
  }
  if (fired === world.alerts.fired) return world
  return { ...world, rng: { ...world.rng, ids }, alerts: { ...world.alerts, fired } }
}
