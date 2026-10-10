# CLAUDE.md — Cloud Engineer Simulator (`cloud-engineer-sim`)

A browser-based **Azure cloud-engineering simulation and learning game**. The player is hired to
build, run, break and fix a client's Azure infrastructure. It is **not** a diagramming tool.
Static site on GitHub Pages: no backend, no real Azure, no credentials.

Read first: `Docs/PROJECT_INTRO.md`, `Docs/MVP_DESIGN.md` (the MVP product & technical design),
`Docs/INSTRUCTIONS.md`, `Docs/MISSION_AUTHORING_GUIDE.md`, `Docs/BOOTSTRAP_REPORT.md` (architecture,
first mission, build order; refines the MVP design where they differ), `Docs/DECISIONS.md`.

## Hard rules

1. **Accuracy comes from Microsoft Learn.** Implement Azure behaviour only from a rule in
   `Docs/AZURE_FACTS.md` that cites a Learn page. Missing rule → research it on Learn, add it, then
   build. `UNCERTAIN` rule → don't implement it as stated: refuse as *not modelled* or label a
   simplification. Never invent Azure behaviour, names or error codes.
2. **One world, two ways to change it**: a command (player or NPC) or time (`step`). UI, missions
   and faults never patch state directly.
3. **Desired config, provisioning state and runtime state stay separate.**
4. **Faults are state, never flags.** An incident is a real operation (it shows in the Activity Log)
   or a real external condition.
5. **One flow evaluator.** Canvas, IP flow verify, availability probes and mission checks all ask the
   same function whether traffic is allowed.
6. **Dependencies and telemetry are derived**: never stored separately, never generated independently.
7. **Deterministic engine**: `src/engine` has no React/DOM imports, no `Date.now()`, `new Date()`,
   `Math.random()` or timers (`tests/boundaries.test.ts`).
8. **ARM-shaped resources**: ARM IDs, ARM types, ARM property names wherever modelled.
9. **Scope discipline**: build vertically for the current mission. No backend, multi-cloud, real Azure,
   full portal/CLI/Bicep/Git/Actions clones. Every feature needs a learning purpose.
10. **Missions are data** and check the world by exposure and relationships, not by resource names.

## Stack and commands

Vite 8 · React 19 · TypeScript 6.0 (strict; pinned below 6.1 because typescript-eslint supports
`<6.1.0`) · Vitest 5 · ESLint 10. Node 22 (`.node-version`).

- `npm run dev`: local dev server (http://localhost:5173/cloud-engineer-sim/)
- `npm run check`: typecheck, lint, test, build. Must be green before every commit.
- CI: `.github/workflows/ci.yml` verifies every push/PR and deploys `main` to GitHub Pages.

## Layout

```
src/engine/   headless simulation core (world, clock, operations, deployments, flow engine, telemetry)
src/engine/azure/  Azure resource types: ARM IDs, CIDR maths, names, command handlers     [step 4]
src/missions/ mission engine + mission data                                              [from step 9]
src/store/    Zustand store + tick loop                                                   [from step 3]
src/ui/       React workspace, canvas, inspector, panels
tests/        engine and mission tests (Vitest)
Docs/         vision, rules, facts register, decisions
```

## Engine API (step 2)

`createWorld({ seed, epochMs })` · commands: `createRegistry(handlers)`, `dispatch(world, registry, cmd)`,
`dryRun(...)` for Review + create · time: `step(world, simMs)`, `advance(world, realMs)` (speed/pause) ·
`saveWorld` / `loadWorld`. Handlers return refusals with a `ruleId` from `AZURE_FACTS.md` and never write
the Activity Log: `dispatch` records `Started` + `Succeeded`/`Failed` for every write (MON-8).
`tests/facts.test.ts` fails if `src/` cites a rule ID that isn't in the register.

## Azure control plane (step 4)

`src/engine/azure/` (exported as `azure` from the engine): one module per resource family, each a set of command
handlers registered in `AZURE_COMMANDS` (the store's default registry). Commands: `scenario/addSubscription`
(setup, not logged), `arm/resourceGroups/write`, `arm/virtualNetworks/write`, `arm/subnets/write`,
`arm/networkSecurityGroups/write`, `arm/securityRules/write` + `/delete`, `arm/publicIPAddresses/write`,
`arm/networkInterfaces/write`, `arm/virtualMachines/write` (creates the OS disk too, VM-15s; power state lives in
`world.runtime`, VM-7). Resources are keyed by the lower-cased ARM ID (ARM-2s); look them up with
`azure.getResource`. Subnets and security rules are child resources (SUB-9s, NSG-13s). Activity log
`operationName` = `{type}/write|delete` (ARM-3s). Every refusal cites a rule; cases Learn doesn't cover are
`not-modelled`, never guessed. `tests/engine/azure/fixtures.ts` builds the standard test worlds.

## Store and UI (step 3)

`src/store/gameStore.ts`: Zustand (vanilla) store `{ world, session, lastRefusal }`. The UI changes the world
only through `store.dispatch(command)` (caller defaults to the player) and time through `tick(realMs)`.
`tickLoop.ts` drives it from animation frames (fake scheduler in tests), `persistence.ts` is the guarded
localStorage save slot (T-6). Components read with `useGame(selector)` and select the smallest value they need.
The bottom panel lists only tools that work.

## Building in the UI (step 4b)

*Create a resource* opens in the inspector pane (`CreatePanel.tsx`): type picker → form → `ReviewCreate.tsx`, which
dry-runs the exact command (`store.check`) before **Create** dispatches it. Editing is the same form with
`preset.mode = 'edit'` (a write to the same name updates). `RefusalNotice.tsx` says whose rule it is: an Azure
rule, or a case the simulator doesn't model; it shows the rule ID and its Learn link. Those come from
`Docs/AZURE_FACTS.md` itself, imported at build time (`src/ui/facts.ts`), so the register is the only copy.
`ResourceList.tsx` is a temporary list in the canvas area until the canvas (step 7). New worlds include the
made-up sandbox subscription (`SANDBOX_SUBSCRIPTION`).

## Network flow engine (step 5)

`src/engine/azure/flow.ts`: `evaluateFlow(world, NicFlow)` is **the** answer to "is this connection allowed?"
(rule 5). The canvas, probes, traffic and mission checks call it; never re-derive reachability elsewhere. Inbound
goes through the subnet NSG and then the NIC NSG, outbound through the NIC and then the subnet (NSG-7). Rules run
by priority, first match wins, defaults last (NSG-1, NSG-3), and match the VM's *private* IP (NSG-14). Service tags
follow NSG-15/15s: 168.63.129.16 is in `VirtualNetwork` too, so `AllowVNetInBound` (65000) decides health probes
before `AllowAzureLoadBalancerInBound`. With no NSG at all, internet inbound is denied (NSG-8, NW-7s) and anything
else is not modelled (NSG-8u). Built on it: `ipFlowVerify` (NW-1/2/6s) and `effectiveSecurityRules` (NW-4, VM-5),
shown as bottom-panel tabs (`NetworkWatcher.tsx`, `BottomTools.tsx`). Stateful flow records (NSG-4: rule changes
only affect new connections) belong to the traffic system (step 8), not to the evaluator.

## Deployment engine (step 6)

`src/engine/deployments.ts` + `dispatch`: a write whose handler has `durationMs` (set from `azure.PROVISIONING_MS`,
made-up game-paced times, ARM-13s) runs as a one-operation deployment (ARM-12s). Its resources show `Creating` /
`Updating` / `Deleting` (ARM-1s, ARM-5) and the activity log gets only `Started`; `deploymentSystem` completes it at
the first tick boundary after `endsAt`, sets `Succeeded` and logs `Succeeded` with the same IDs (MON-10s). Resource
group writes stay synchronous (ARM-6). Writing to, or referencing, a resource that's still in progress is refused as
not modelled (ARM-11u) in both `dispatch` and `dryRun`. VMs: power state `creating` → `running` (`vmPowerSystem`,
VM-19s). Security rules apply once their write succeeds (ARM-14s). History: newest 800 per resource group (ARM-10).
Tests: `ok()` in `tests/engine/azure/fixtures.ts` waits for the deployment (`settle`); `start()` doesn't.
UI: Deployments tab (`DeploymentsPanel.tsx`), `Creating…` badges in the resource list, Create switches to Deployments.

## Architecture canvas (step 7)

Follow `.claude/skills/visual-infrastructure/SKILL.md` (v1.0, decisions D-4/D-5). `src/ui/canvas/graph.ts`:
`buildCanvasGraph(world, watched)` is pure and tested headless (`tests/ui/canvasGraph.test.ts`): nesting
RG → VNet → subnet → compute unit (a VM drawn through its NIC), deterministic auto-layout, association lines from
`azure.dependenciesOf` (`src/engine/azure/dependencies.ts`), traffic lines only from `ipFlowVerify` via
`evaluateWatchedFlow`. Watched flows and the layer are view state in `session.ui.canvas` (`watchFlow`,
`unwatchFlow`, `setCanvasLayer`); a selected flow is `flow:<id>` and opens `FlowInspector.tsx`. React Flow
(`@xyflow/react`) is lazy-loaded; below 900 px the resource list replaces the canvas. Azure icons (D-5) go
unmodified into `public/azure-icons/` once downloaded (the container's proxy blocks the download).

## Runtime: apps, players, metrics (step 8a)

All `SIM` (RUN-1s..RUN-5s), set up by scenario commands (not logged): `scenario/setWorkload` puts a simulated app on a
VM (`game-api` on 443 needing `postgres` on 5432, `src/engine/azure/workloads.ts`), `scenario/setTraffic` switches
the `beta-launch` player profile on/off (`traffic.ts`). Systems, in order after the deployment/power systems:
`workloadHealthSystem` (app health = `ipFlowVerify` at both ends; writes only on change), `trafficSystem` (2 new
players per sim second, 20-min sessions grouped per minute; new connections need a running VM, a public IP (PIP-10s),
an allowed inbound 443 and an `up` app; established sessions survive rule changes, NSG-4), `metricsSystem` (MON-6
names, one sample per sim minute for running VMs). Service state lives in `world.runtime[vm].service`, sessions in
`world.traffic`, samples in `world.telemetry.metrics`. UI: `SimulatedApp.tsx` in the VM inspector, app status on
canvas cards, Metrics tab (`MetricsPanel.tsx`, dataviz rules: one axis per chart, crosshair, keyboard, table).
Tests: `tests/engine/azure/runtime.test.ts`, fixtures `pixelForge()` / `pixelForgeWithApps()`.

## Monitoring: Application Insights, availability tests, alerts (step 8b)

`src/engine/azure/monitoring.ts` (MON-5, MON-14..MON-29s): `arm/workspaces/write` (PerGB2018, 30 days),
`arm/components/write` (workspace-based only, `kind` web), `arm/webtests/write` (standard tests linked by the
`hidden-link:{component}` tag; URL must be an IPv4 address, no DNS in the sim), `arm/metricAlerts/write`
(`WebtestLocationAvailabilityCriteria`, `location` global). `availabilitySystem` runs each location once per
`Frequency`, staggered; `runTest` decides every run with `ipFlowVerify` from the location's made-up 192.0.2.x address
plus the simulated app (game API up → 200, degraded → 503, blocked → timeout). Rows are `AppAvailabilityResults`-shaped
in `world.telemetry.availability`; the Availability metric is derived (`availabilityPercent`). `alertSystem` evaluates
on `evaluationFrequency`: failed locations ≥ `failedLocationCount` fires one alert in `world.alerts.fired`, three clear
checks resolve it (`autoMitigate`). UI: create forms in `CreatePanel.tsx`, inspector details, Availability tab
(`AvailabilityPanel.tsx`: location × round grid as a table, newest results) and Alerts tab (`AlertsPanel.tsx`, badge
when firing). Tests: `tests/engine/azure/monitoring.test.ts`, fixture `pixelForgeMonitored()`.

## Working discipline

- Small, reviewable steps (see `Docs/BOOTSTRAP_REPORT.md` §I). Finish each with `npm run check`.
- Test the engine more than the UI. Every Azure rule has a test that asserts its rule ID.
- Canvas and inspector work follows `.claude/skills/visual-infrastructure/SKILL.md` (v1.0).
