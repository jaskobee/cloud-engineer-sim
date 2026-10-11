# Guided build plan and portal-accurate VM networking: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The VM wizard creates the NIC and public IP like the portal, Guided mode gives an exact build recipe, and
every resource says who created it.

**Architecture:** Deployments get a list of operations; a new pipeline-level command `arm/deployments/write` validates
and applies several resource writes in order and runs them as one deployment. The VM wizard sends that command. The
build plan is mission data (`MissionDef.buildPlan`), rendered by the quest panel; "Created by" is derived from the
activity log.

**Tech Stack:** TypeScript 6.0 strict, React 19, Fluent UI v9, Vitest 5, Playwright.

**Spec:** `Docs/specs/2026-10-11-guided-build-plan-and-vm-networking-design.md`

## Global Constraints

- Every Azure behaviour and portal label cites a rule in `Docs/AZURE_FACTS.md`; no Learn source, no label (CLAUDE.md rule 1).
- The engine stays deterministic: no `Date.now()`, `Math.random()`, timers or React in `src/engine`, `src/missions`.
- Checks and plan `done` functions read relationships, never names (rule 10); reachability only via the flow evaluator (rule 5).
- Default names are made up and marked Simulator: public IP `<vm>-ip`, network interface `<vm>-nic`.
- Public inbound ports and NIC network security group offer only **None** (PORTAL-20s).
- `npm run check` and `npm run test:e2e` green before every push. Commit trailer:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the `Claude-Session:` line.

## Review Focus

1. A deployment whose 2nd write is refused (e.g. VM name taken) must refuse the whole deployment and leave no public IP
   or NIC behind → test in Task 3.
2. A save from schema v1 (single `operation`) must load and its running deployment must still complete → Task 2.
3. Public IP **None** must produce NIC + VM only, and the NIC payload must carry `publicIPAddressId: null` → Task 4.
4. The VM wizard with no VNet/subnet in the VM's region must not offer a Create button that silently fails: Review +
   create shows the refusal → Task 4 (empty subnet value → refusal from the NIC handler).
5. A resource created by an operation inside a multi-op deployment must show its own caller in **Created by**, and the
   OS disk (never logged, VM-15s) must show "Not in the activity log", not crash → Task 5.

---

### Task 1: Register

**Files:** Modify `Docs/AZURE_FACTS.md`, `src/engine/azure/networkInterfaces.ts` (PIP-5u reference).

- [ ] Add sources **L-VMSTATICPIP** (`https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/virtual-network-static-public-ip`, updated 2026-02-25) and **L-VNETQS** (`https://learn.microsoft.com/en-us/azure/virtual-network/quick-create-portal`, updated 2026-03-27).
- [ ] Add PORTAL-19, PORTAL-20, PORTAL-20s, PORTAL-21s, ARM-15s with the spec §4 wording and verbatim quotes; replace PIP-5u by **PIP-5** (VERIFIED, L-PIPPORTAL, L-VMSTATICPIP); update PORTAL-7s, VM-16s, ARM-12s; drift-log row for 2026-10-11.
- [ ] `networkInterfaces.ts`: the Dynamic-Standard refusal becomes `rule('PIP-5', …)` ("A Standard public IP is always Static").
- [ ] `npm run check` green (facts test catches dangling IDs). Commit.

### Task 2: Deployments hold a list of operations

**Files:** `src/engine/deployments.ts`, `src/engine/commands.ts`, `src/engine/world.ts` (schema 2), `src/engine/save.ts`
(migration 1→2), `src/ui/DeploymentsPanel.tsx`, `src/ui/portal/DeploymentPage.tsx`, `src/ui/portal/notifications.ts`.
Tests: `tests/engine/deployments.test.ts`, `tests/engine/save.test.ts`.

**Interfaces (produces):**
```ts
interface DeploymentOperation { operationId; operationName; targetResourceId; created: ArmId[]; updated: ArmId[]; deleted: ArmId[];
  startsAt: number; endsAt: number; startedEventDataId: string; finishedEventDataId: string; completedAt?: number }
interface Deployment { …; operations: DeploymentOperation[] }   // `operation` and deployment-level finishedEventDataId removed
const mainOperation = (d: Deployment) => d.operations.at(-1)!   // the target "Go to resource" opens
```

- [ ] Tests: single write → `operations.length === 1`, behaviour unchanged (existing tests adapted). Migration test: a
  v1 save with `operation` + `finishedEventDataId` loads as v2 and its running deployment completes on `step`.
- [ ] `deploymentSystem`: for each running deployment, complete due operations in order (mark their resources
  Succeeded / delete, log `Succeeded` at `tick.end`); when an operation completes and a next one exists, log the next
  one's `Started` at `tick.end`; the deployment is `Succeeded` when the last completes.
- [ ] UI: DeploymentPage lists one row per operation (resource, type, operation status: Created/Running), as Operation
  details (PORTAL-9); DeploymentsPanel and notifications use `mainOperation`.
- [ ] Check green, commit.

### Task 3: `arm/deployments/write`

**Files:** `src/engine/commands.ts` (+ `DEPLOYMENT_COMMAND = 'arm/deployments/write'`), `src/engine/index.ts`. Test:
`tests/engine/azure/deploymentWrite.test.ts`.

**Interfaces (produces):** payload `{ resources: { type: string; payload: unknown }[] }`, handled inside `dispatch` and
`dryRun` (not a registry handler); every inner write must have a WriteTarget and a duration ≥ 0. Deployment name
`<last target name>-<timestamp>`, correlation ID shared by every operation.

- [ ] Tests (assert rule IDs):
  - PIP → NIC (refs the PIP) → VM (refs the NIC) is accepted; right after dispatch all four resources (PIP, NIC, disk,
    VM) are `Creating`; the activity log has one `Started` (the PIP's).
  - After 6 s the PIP is Succeeded, the NIC `Started`; after 6+6+90 s everything Succeeded, the deployment Succeeded,
    one Started+Succeeded pair per operation, same correlationId (ARM-15s, ARM-8).
  - Inner VM name taken → refused with the VM handler's rule; world resources unchanged; log has Started+Failed of the
    VM operation only (Review Focus 1).
  - A reference to a resource of *another* running deployment → `ARM-11u`.
  - `dryRun` returns the same refusal without changing the world.
- [ ] Implement: apply inner writes in order on an unmarked working world (busy check against that world, so earlier
  inner resources pass), diff per step for created/updated/deleted, chain `startsAt`/`endsAt` from each handler's
  `durationMs`, then mark all created/updated/deleted with ARM-1s states at once.
- [ ] Check green, commit.

### Task 4: VM wizard = the portal's

**Files:** `src/ui/portal/create/wizards.tsx`, `create/commands.ts`, `create/fields.tsx` (if a fixed field needs a hint),
new `create/PublicIpDialog.tsx`. Test: `tests/ui/createCommands.test.ts`.

**Interfaces (produces):** VM wizard values `vnetId`, `subnetId`, `publicIp: 'new' | 'none'`, `publicIpName`
(default `<name>-ip`), `nicName` (always `<name>-nic`). `buildCommands('virtualMachine', v)` →
`[rg write?, { type: 'arm/deployments/write', payload: { resources: [pip?, nic, vm] } }]`.

- [ ] Tests: Create new → PIP (Standard, Regional, Static, IPv4) + NIC (`subnetId`, `publicIPAddressId` = PIP ID,
  `networkSecurityGroupId: null`) + VM (`networkInterfaceId` = NIC ID). None → NIC (`publicIPAddressId: null`) + VM.
  New RG → RG write first. Empty subnet → `checkAll` returns a refusal (Review Focus 4). `targetIdOf` → the VM.
- [ ] Basics: section **Inbound port rules** with fixed **Public inbound ports: None** + SimNote (PORTAL-19, PORTAL-20s).
- [ ] Networking › **Network interface**: Virtual network (VNets in the VM's region), Subnet (`name (prefix)`), Public IP
  select (`(new) <name>` / None) with a **Create new** link that opens a Fluent Dialog "Create public IP address"
  (Name; SKU Standard and Assignment Static shown fixed; **OK**), NIC network security group fixed **None** + SimNote,
  Simulator read-only "Network interface name". Changing the VM name updates the default PIP name until edited.
- [ ] Summary: Virtual network, Subnet, Public IP `(new) name` / None, Network interface `(new) name`.
- [ ] Check green, commit.

### Task 5: Created by

**Files:** `src/engine/activityLog.ts` (`creatorOf`), `src/ui/portal/resourceFacts.ts`, `src/ui/portal/browse.ts`,
`src/ui/portal/BrowsePage.tsx`, `src/ui/portal/sections/otherSections.tsx` (RG overview), `src/missions/info.ts`
(activity log topic line), new `src/ui/portal/callers.ts` (`callerLabel(caller, world)`). Tests:
`tests/engine/activityLog.test.ts` (new), `tests/ui/resourceFacts.test.ts`, `tests/ui/browse.test.ts`.

**Interfaces:** `creatorOf(world: World, id: ArmId): string | null` — caller of the earliest `Succeeded` entry whose
`resourceId` equals `id` (case-insensitive) and whose `operationName` ends in `/write`; resource groups included.
`callerLabel`: the player principal → "You"; a mission actor's `principalName` → its `displayName`; otherwise the raw
caller; null → "Not in the activity log".

- [ ] Tests: Mia's RG → "Mia Becker"; player VNet → "You"; NIC from a multi-op deployment → "You"; OS disk → "Not in
  the activity log" (Review Focus 5).
- [ ] Essentials row **Created by** (Simulator mark, PORTAL-21s) on resources and resource groups; a **Created by**
  column on service lists and the RG resource table.
- [ ] Check green, commit.

### Task 6: Build plan data

**Files:** `src/missions/types.ts`, `src/missions/pixelforge-launch-day.ts` (new `BUILD_PLAN`, roles `vnet`,
`nsgToFill`, `nsgToAssociate`), `tests/missions/play.ts` (`Design.vmCreate: 'portal' | 'nicFirst'`; INTENDED uses
`portal`), `tests/missions/paths.test.ts`, new `tests/missions/buildPlan.test.ts`.

**Interfaces:**
```ts
interface BuildSetting { label: string; value: string; why: string; rules: readonly string[] }
interface BuildStep { id: string; title: string; intro: string; settings: readonly BuildSetting[]; portalPath: readonly PathStep[]; done: (world: World) => boolean }
interface BuildPlan { stage: string; intro: string; steps: readonly BuildStep[] }   // MissionDef.buildPlan?: BuildPlan
const currentBuildStep = (plan: BuildPlan, world: World): number   // first step not done; steps.length when all done
```

Steps (spec §3.3; step 1 of the spec becomes the plan `intro` plus a derived "Already in the subscription" list in the UI):
`resource-group` (an RG in westeurope), `vnet` (a westeurope VNet), `subnets` (it has ≥ 2 subnets), `nsgs` (≥ 2
westeurope NSGs), `game-rules` (≥ 1 NSG with ≥ 2 custom inbound rules), `data-rules` (≥ 2 such NSGs), `associate`
(every subnet of the westeurope VNet has an NSG), `game-vm` (a VM whose NIC has a public IP), `db-vm` (a VM whose NIC has
none), `apps` (game API and PostgreSQL installed), `monitoring` (objective `monitoring` passes). Rule steps count rules,
not reachability; the client's objectives check reachability (rule 5).

- [ ] Tests: every `settings[].rules` ID exists; every path step cites a PORTAL rule and resolves; on the INTENDED
  build the plan advances in order, all done at the end; INTENDED (portal VM create) and ALTERNATIVE (NIC first) both
  finish the mission (existing pixelforge tests).
- [ ] Check green, commit.

### Task 7: Build plan in the ticket

**Files:** new `src/ui/BuildPlan.tsx`, `src/ui/QuestPanel.tsx`, `src/ui/portal/portal.css`.

- [ ] Guided and plan's stage: `BuildPlan` above the objectives — intro, "Already in the subscription" (top-level
  resources and groups whose `creatorOf` isn't the player, with Created by), numbered steps; current expanded with a
  settings table (Setting / Value / Why, rule IDs as INFO-style links) and its `PortalPath` highlighted; done ✓ collapsed
  (expandable). Objectives heading becomes "What the client checks"; objective paths don't highlight while the plan has
  steps left. Standard and Expert: no plan.
- [ ] Check green, commit.

### Task 8: e2e, docs, QA, push

**Files:** `e2e/smoke.e2e.ts`, `CLAUDE.md`, `Docs/DECISIONS.md` (D-8), `claude/STATUS.md` (project doc).

- [ ] e2e: Guided start shows "Build plan" with step 1 current; VM wizard Networking shows Public IP and Create new
  dialog (sandbox world with a VNet built through the UI is enough: assert the tab's fields and the dialog).
- [ ] `npm run check`, `npm run build`, `npm run test:e2e` green.
- [ ] azure-qa agent on the diff; fix BLOCKER/MAJOR; push; update STATUS.
