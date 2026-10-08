# Cloud Engineer Simulator — Project Bootstrap Report (v3)

_Date: 2026-10-08 · Project folder: `C:\Users\jaskoX\Documents\repos\Cloud-Engineer` · Repo name: `cloud-engineer-sim` · Review only, no code created · Sources at the end ([S1]–[S11])_

### Decisions taken (2026-10-08)
| # | Decision |
|---|---|
| D-1 | Repo is called **`cloud-engineer-sim`**, built from scratch in the `Cloud-Engineer` folder |
| D-2 | **First vertical slice uses Virtual Machines** (Container Apps later) |
| D-3 | **Accuracy source = Microsoft Learn** (official docs). Every enforced rule must be findable on Learn and cited. Uncertain points are flagged, never guessed |
| D-4 | We **write our own `visual-infrastructure` skill** (before building the canvas) |

---

## TL;DR

1. **We start from zero.** The folder holds three docs. No repo, app, CI or Pages yet.
2. **The core is one deterministic, headless simulation engine.** The world changes only through **commands** (player or NPC) or **time**. Canvas, inspector, logs, metrics, alerts, missions and later CLI/Bicep/pipelines are views of or commands against it.
3. **Desired configuration, provisioning state and actual runtime state are separate from day one.** That separation is what makes deploy → run → break → fix possible.
4. **The VM decision makes the brief's NSG story accurate.** For a VM, inbound traffic has to be allowed by both the subnet NSG and the NIC NSG [S1]. A Standard public IP is closed to inbound traffic until an NSG allows it [S3]. And NSG rule changes affect only *new* connections [S2]. That last point gives the incident a beautifully realistic clue (section G).
5. **The slice needs a small network flow engine**: 5-tuple evaluation through subnet and NIC NSGs in Azure's documented order, plus two Network Watcher-style tools (IP flow verify, effective security rules) [S6]. That's the engine heart of mission 1.
6. **First milestone before gameplay:** TypeScript + Vite app deployed to GitHub Pages by GitHub Actions, with the empty engine under test.

---

## A. Project understanding

The product is a **job simulator for cloud operations**, not a course and not a diagramming tool. The player is hired to look after a client's Azure environment and learns Azure because the job demands it. Concepts appear when they're needed, and INFO explains the "why" on demand.

What makes it a *simulation* is **one authoritative world**. A configuration choice in minute 3 can cause an outage in minute 40, and the evidence exists because the world produced it. The canvas is the main way to *read* that world (what exists, what talks to what, what's unhealthy, where the boundaries are), so it's a debugging tool first.

The learning model is **need → act → feedback → problem → investigate → explain → fix**. Microsoft certification outlines (AZ-900 → AZ-104 → AZ-700 → AZ-400 → later AZ-305) are a versioned curriculum map, not the gameplay. Assistance scales from Guided to Expert.

NetSim is a sibling product with the same philosophy but is **technically independent**. Real Azure is an end-stage option. The MVP is fully simulated on GitHub Pages, and the model stays **ARM-shaped** so a future adapter stays possible.

The target is **one believable first day**: ticket → build → deploy → it runs → it breaks → investigate → fix → client signs off → progress.

---

## B. Current state

| Item | State |
|---|---|
| Folder | `Docs/INSTRUCTIONS.md`, `Docs/MISSION_AUTHORING_GUIDE.md`, `Docs/PROJECT_INTRO.md`. The MVP design doc is only in the claude.ai Project |
| Git | **Not a repository.** Git commands in this folder currently resolve to a repository at `C:\Users\jaskoX`. **The first setup step is `git init` inside `Cloud-Engineer`**, so commits don't land in that home-folder repo. Cleaning up the home-folder repo is separate and worth doing, because a stray `git add -A` there could stage `.azure/` |
| Code, state, tests, CI, Pages | None |
| GitHub Pages | Free plan: public repos only. Private repos need Pro/Team/Enterprise [S11] |
| Skills | None yet. `visual-infrastructure` will be written by us (D-4) |

---

## C. Architecture assessment — the docs vs a buildable design

| Topic | Docs say | Recommendation |
|---|---|---|
| Stack | React, TypeScript, Vite, Zustand, XYFlow, Monaco, js-yaml, IndexedDB/LocalStorage, Vitest, Playwright, Pages, Actions | ✅ Agree. Defer **Monaco** (until the DevOps mission), **IndexedDB** (localStorage until saves get large) and **Playwright** (add with the first playable slice) |
| Generic model + Azure adapter | Separate generic simulation from Azure definitions | ⚠️ Keep **mechanics** generic (clock, deployments, flow evaluation, telemetry, missions) and **resources** Azure-specific. No cloud-neutral resource abstraction now |
| Repo layout (MVP §34) | `engine/*` **and** `azure/*` with parallel subfolders | ⚠️ Simplify (section E) |
| First mission | One mission covering the whole loop (brief) vs 10 quests (MVP doc) | ✅ One mission for the slice. Re-cut the campaign afterwards |
| Compute | App Service (Quest 02), Container Apps (Quest 05) | **VMs first (D-2).** Containers/App Service become later "choose your compute" lessons. Note for later: on an *external* Container Apps environment, public inbound traffic doesn't go through the subnet NSG [S10], so NSG lessons belong on VMs (or internal environments) |
| Database with no public exposure | Private endpoint + database | For the slice: **PostgreSQL on a second VM in a private subnet**, with NSG-based segmentation. Private endpoints + private DNS come later |
| Assistance modes | 3 (docs) vs 4 (brief) | 3 modes. "Beginner" = Guided + first-run coach marks |
| Accuracy | "Verify against Microsoft docs" | ✅ `docs/AZURE_FACTS.md`: every enforced rule has an ID, statement, Learn URL and status (`verified` / `uncertain`). Tests cite rule IDs. Unknown cases are refused as "not modelled" |
| Certification mapping | "Current objectives" | ✅ Versioned metadata (outline + date), never in engine logic |

---

## D. Gaps (all of it. This is the priority order)

### MVP critical (needed for the PixelForge slice)
1. Repo, toolchain, CI (typecheck + test + build), Pages deploy.
2. **World model**: desired config / provisioning state / runtime state.
3. **Deterministic clock**: `step(world, dt)`, seeded RNG, pause / 1× / fast-forward.
4. **Control plane**: operations that validate and then apply, or refuse with rule ID + explanation. Portal-style Review + create = dry run of the same operation.
5. **Deployment engine**: operations progress over sim time, provisioning states, partial failure.
6. **Activity Log**: every write records who, what, when, status.
7. **Resource types for the slice**: resource group, VNet, subnet, NSG (+ security rules, subnet/NIC association), Standard public IP, NIC, Linux VM (+ OS disk), Log Analytics workspace, Application Insights (workspace-based) with a standard availability test, metric alert rule.
8. **Network flow engine**: 5-tuple evaluation through NSGs in the documented order (inbound: subnet then NIC; outbound: NIC then subnet [S1]), priority order and first match [S2], default rules [S2], service tags `Internet`/`VirtualNetwork`/`AzureLoadBalancer` [S2], stateful flows with "rule changes affect only new connections" [S2], and no NSG at all = blocked [S1].
9. **Diagnostic tools**: IP flow verify (allowed/denied + rule + NSG) [S6] and effective security rules for a NIC.
10. **Runtime evaluators**: VM power state, game service health (depends on DB reachability), player sessions from a traffic model.
11. **Telemetry**: availability test results, VM platform metrics, alerts, all derived from evaluator outcomes.
12. **Canvas v1 + inspector v1** on the same world, guided by our `visual-infrastructure` skill.
13. **Mission engine**: data-defined missions, stages, state-based checks, scenario triggers (as real operations), hint ladders, assistance modes, post-incident question.
14. **Workspace layout + INFO entries.**
15. **Save/load** with `schemaVersion`.

### Important (right after the slice)
Mission 2 (IaC + pipeline, see G), read-only "View as Bicep" generated from the world, minimal progression (XP, badges, levels), Playwright smoke test, NAT gateway / outbound lesson.

### Future
Bicep parsing, Git subset, `az` CLI subset, Container Apps, App Service, storage, managed identity + RBAC, private endpoints + DNS, load balancer / Application Gateway, peering, scaling, cost, architecture scoring, governance, persistent simulation, real Azure adapter.

---

## E. Recommended architecture

```text
┌──────────────────────────────── React UI ─────────────────────────────────────┐
│ Quest panel │ Architecture canvas (XYFlow) │ Resource inspector                 │
│ Bottom: Deployments · Activity log · Availability · Metrics · Alerts ·          │
│         Network Watcher   (Terminal, Pipeline, Git appear when they work)       │
└───────────────┬──────────────────────────────────────────────┬────────────────┘
       select(world) — read-only                     dispatch(command)
┌───────────────▼──────────────────────────────────────────────▼────────────────┐
│ Zustand store: { world, session: { missionId, mode, ui } }  ·  tick loop        │
└───────────────┬────────────────────────────────────────────────────────────────┘
                ▼
┌──────────────── Simulation engine (src/engine — TypeScript, no React, pure) ────┐
│  CONTROL PLANE            DEPLOYMENT ENGINE          RUNTIME                    │
│  validate → apply  ─────► operations over sim ─────► VM state · service health  │
│  or refuse (rule ID       time · provisioning        · sessions (traffic model) │
│  + Learn link)            state · partial failure            │                  │
│        │                                                     ▼                  │
│        │                                    NETWORK FLOW ENGINE                 │
│        │                                    5-tuple → NSG eval (subnet/NIC      │
│        │                                    order) → allowed/denied + rule      │
│        ▼                                    · flow table (stateful)             │
│  ACTIVITY LOG ◄── every write (caller)              │                           │
│                                                     ▼                           │
│  CLOCK + SEEDED RNG ── step() ──────────► TELEMETRY: availability results,      │
│                                           VM metrics, alerts                    │
└───────────────┬───────────────────────────────────────────┬────────────────────┘
                ▼                                           ▼
   MISSION ENGINE (pure)                              PERSISTENCE
   stages · checks · scenario triggers (NPC ops)      localStorage, versioned,
   · hints · modes                                    bounded telemetry
```

**Rules that keep it a simulation**
1. **The world changes only through commands or time.**
2. **Faults are state, never flags.** An incident is an NPC's real operation (in the Activity Log) or a real external condition.
3. **Dependencies are derived, never stored.** One `dependenciesOf(world, id)` feeds canvas edges, deployment ordering and delete protection.
4. **Reachability is computed, never declared.** The canvas, IP flow verify, availability tests and mission checks all call the *same* flow evaluator. If they ever disagree, it's a bug.
5. **Telemetry is output, never input.**
6. **Determinism**: sim time + seeded RNG. No `Date.now()` or `Math.random()` in the engine.
7. **ARM-shaped resources**: ARM IDs, ARM types, ARM property names where modelled. That enables "View as Bicep", an `az` subset and a future Azure adapter. No adapter interface until there's a second implementation.

**Proposed layout**
```text
cloud-engineer-sim/
├─ .github/workflows/        ci.yml (typecheck, test, build) · deploy.yml (Pages)
├─ .claude/skills/           visual-infrastructure/ (ours, D-4) · later: new-mission, azure-fact
├─ docs/                     project docs · AZURE_FACTS.md · decisions (ADRs)
├─ src/
│  ├─ engine/                world, clock, operations, deployments, flow engine, runtime, telemetry
│  │  └─ azure/              one module per resource type: schema, validation, runtime, INFO
│  ├─ missions/              mission engine + pixelforge-launch-day.ts (data)
│  ├─ store/                 Zustand store + tick loop
│  ├─ ui/                    workspace, canvas, inspector, panels, design tokens
│  └─ main.tsx
├─ tests/                    engine + mission end-to-end (Vitest); Playwright later
└─ index.html · vite.config.ts (base '/cloud-engineer-sim/') · tsconfig.json (strict)
```
An import-boundary check (`src/engine` never imports React or `src/ui`) runs in CI from day one.

---

## F. Simulation state model

```ts
interface World {
  schemaVersion: 1
  clock: { now: number /* sim ms */; speed: 1 | 4 | 16; paused: boolean; seed: string }

  // DESIRED — what someone asked for
  tenant: {
    subscriptions: Record<string, Subscription>
    resourceGroups: Record<ArmId, ResourceGroup>
    resources: Record<ArmId, Resource>
  }
  deployments: Record<string, Deployment>       // operations with start/end sim time, state, error

  // ACTUAL — recomputed by runtime + flow engine
  runtime: Record<ArmId, {
    health: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
    reasons: { code: string; evidence?: EvidenceRef }[]
    detail?: VmRuntime            // { powerState, services: { gameApi: 'up'|'down', postgres: 'up' } }
  }>
  flows: FlowRecord[]             // established connections (stateful NSG semantics)

  // OUTSIDE WORLD
  external: {
    traffic: { profile: 'beta-launch' }          // deterministic new-session curve
    actors: { id: string; role: string }[]       // client staff, security consultant
    probeLocations: string[]                     // availability test locations
  }

  // EVIDENCE — bounded
  activityLog: ActivityEntry[]
  telemetry: {
    availability: RingBuffer<{ time; location; success; durationMs; message }>
    metrics: Record<ArmId, Record<string, RingBuffer<[number, number]>>>   // e.g. Percentage CPU, Network In Total
  }
  alerts: { fired: { ruleId: ArmId; firedAt: number; resolvedAt?: number }[] }
}

interface Resource {
  id: ArmId; type: string; name: string; location: string; tags: Record<string, string>
  properties: Record<string, unknown>           // ARM-named configuration
  provisioningState: 'Creating' | 'Updating' | 'Deleting' | 'Succeeded' | 'Failed'   // exact set → AZURE_FACTS
  createdBy: string; changedAt: number
}

// VISUAL — separate, never authoritative (MVP §27)
session.ui.canvas = { positions: Record<ArmId, { x: number; y: number }>; collapsed; layers }
```

**Per-resource checklist (from the brief):** identity = ARM ID · type = ARM type · name/location = top level · configuration = `properties` · status = `provisioningState` + runtime state · health = `runtime.health` + `reasons` · dependencies = derived from references (`subnet.id`, `networkSecurityGroup.id`, `publicIPAddress.id`, `networkInterfaces[]`) · permissions = not in slice 1 (RBAC later) · metrics/logs/events = telemetry + Activity Log keyed by ARM ID.

**The flow evaluator** (the most important engine function in the slice):
```text
evaluate(flow = { direction, protocol, srcIp, srcPort, dstIp, dstPort }, world)
  inbound to a VM:   subnet NSG (if any) → NIC NSG (if any)          [S1]
  outbound from VM:  NIC NSG (if any)   → subnet NSG (if any)        [S1]
  neither associated → blocked                                       [S1]
  within each NSG:   custom rules by priority 100–4096, then defaults 65000+;
                     first match wins, processing stops               [S2]
  stateful:          existing flow records survive rule changes;
                     only new connections are re-evaluated            [S2]
  public IP:         Standard SKU is closed to inbound unless an NSG allows it [S3]
returns { access: 'Allow'|'Deny', rule, nsg, stage }   // exactly what IP flow verify shows [S6]
```

**The slice's causal chain (incident):**
```text
NPC operation: add security rule "Deny-Internet-Inbound" (priority 100) to nsg-snet-game
  → Activity Log entry (caller: jonas@…, time)
  ↓
existing player sessions: flow records → keep working [S2]
new connections TCP 443 from Internet: subnet NSG → priority 100 Deny matches first → dropped [S1][S2]
  ↓
availability test (a new connection per run, from ≥5 locations [S7]) → fails ("timeout")
new sessions → 0; active sessions decay as matches end → VM CPU / Network In fall
  ↓
availability alert fires → in-game notification + client message
  ↓
mission stage = Incident; resolution check = flow evaluator + availability results
```

**`step(world, dt)` order:** clock → deployments (outcomes computed from world state *at completion*) → runtime (VM state, DB reachability via flow engine → game service health) → traffic (new sessions attempt flows) → availability probes (same flow engine) → metrics → alerts → mission triggers.

---

## G. First vertical slice — "PixelForge: Launch Day" (VM edition)

### Client
| | |
|---|---|
| Client | PixelForge Games, indie studio, 6 people |
| Situation | Multiplayer game *Starfall Arena* opens a public beta on Friday. The backend is a game API plus a PostgreSQL database, currently on a dev's workstation |
| Goal | Backend running in Azure, secure and monitored for the beta |
| Pain | No one does operations. Their old test environment was "wide open" |
| Constraints | Small budget, EU players (West Europe), admin access only from the office |

### Ticket
> **From:** Lena Vogt, CTO, PixelForge Games
> **Subject:** Beta servers need to be live by Friday
>
> Hi! Our beta opens Friday. We need our game API server and its database running in Azure, in West Europe since our players are in the EU. Players connect to the API over HTTPS. The database must never be reachable from the internet. Only the game server should talk to it. Our team needs SSH for admin work, but only from our office (203.0.113.10). Our old test setup had everything open and we got scanned to death. Mia set up a test network in North Europe last month, but ignore that. And please make sure we hear about it *before* players do if the game goes down. Budget is tight. Thanks!

_(203.0.113.0/24 is a documentation-only range, so the IP is safe to use in a game.)_

### Business → technical requirements
| Business | Technical (visible in Guided, hidden in Standard and Expert) |
|---|---|
| Players reach the API over HTTPS | Game VM with a **Standard public IP**. An NSG must explicitly allow TCP 443 from `Internet`, because Standard public IPs are closed by default [S3] |
| Database never public | DB VM in its own subnet, **no public IP** |
| Only the game server talks to the DB | NSG on the data subnet: allow TCP 5432 from the game subnet, then deny other `VirtualNetwork` inbound, because the default `AllowVNetInBound` would otherwise allow everything inside the VNet [S2] |
| SSH only from the office | Allow TCP 22 from `203.0.113.10/32` only. No SSH open to `Internet` |
| EU | Everything in West Europe. The North Europe test network is unusable anyway: a NIC must be in the same region and subscription as its VNet [S4] |
| Hear about it before players | Application Insights **standard availability test** on the API's health endpoint + availability alert [S7] |
| Tight budget | Small VM size, no extras (advisory) |

### Intended architecture (alternatives allowed)
```text
Internet ──TCP 443──► pip-game-01 (Standard, static)
                         │
RG rg-pixelforge-prod (West Europe)
 ├─ VNet vnet-pixelforge 10.40.0.0/16
 │   ├─ snet-game 10.40.1.0/24 ── nsg-snet-game
 │   │    │   200  Allow TCP 443  from Internet
 │   │    │   210  Allow TCP 22   from 203.0.113.10/32
 │   │    └─ vm-game-01 (Linux) ─ nic ─ pip-game-01
 │   │                 │ TCP 5432
 │   └─ snet-data 10.40.2.0/24 ── nsg-snet-data
 │        │   100  Allow TCP 5432 from 10.40.1.0/24
 │        │   200  Deny  *        from VirtualNetwork
 │        └─ vm-db-01 (Linux, PostgreSQL) ─ nic   (no public IP)
 ├─ Log Analytics workspace ◄── Application Insights (workspace-based)
 │                                  └─ standard availability test → https://<game endpoint>/health
 └─ Alert: availability below threshold
```
Accepted alternatives: names and address ranges are free (checks query exposure and relationships, not names). NSGs on NICs instead of, or in addition to, subnets are fine as long as the effective result is right. Rule priorities are free. **Rejected:** anything exposing SSH or 5432 to `Internet`, a public IP on the DB VM, resources outside West Europe.

### Required resources & dependencies
- **Client-provided** (setup through real operations): subscription, `rg-pixelforge-test` in North Europe with Mia's test VNet (the region trap).
- **Player-built:** RG, VNet, 2 subnets, 2 NSGs (+ rules, associations), public IP, 2 NICs, 2 VMs (+ OS disks), Log Analytics workspace, Application Insights, availability test, alert.
- **Order the engine enforces:** RG → VNet → subnets/NSGs/public IP → NICs → VMs. Log Analytics → Application Insights → availability test → alert. Out-of-order creates are refused with a reason.

### Learning objectives
Business ticket → architecture · resource groups & regions · VNet address space, subnets, the 5 reserved addresses [S5] · segmentation · NSGs: priority, first match, default rules, service tags, stateful flows [S2] · subnet vs NIC NSG evaluation order [S1] · Standard public IP secure-by-default [S3] · least exposure (SSH from one IP, DB private) · VM basics: image, size, SSH key auth [S9] · NIC/VNet region rule [S4] · monitoring: availability tests, alerts, Activity Log · troubleshooting with IP flow verify [S6] and effective security rules.

### Stages
1. **Brief:** read the ticket and open INFO on anything unfamiliar.
2. **Design & build:** canvas + Review + create forms. Objectives tick when the world matches them.
3. **Deploy:** deployments run over sim time and the canvas shows provisioning.
4. **Go live:** beta traffic starts. The player sees a *healthy baseline* (availability green, sessions, CPU) for at least 10 sim minutes.
5. **Incident:** Friday 21:40 sim time, the availability alert fires. Lena writes: *"Weird: people already in matches are fine, but nobody new can log in!"*
6. **Investigate & fix** (hint ladder available).
7. **Validate:** IP flow verify allows 443 and availability is green for 10 sim minutes. The alert resolves.
8. **Post-incident note:** the player picks root cause + evidence, then explains to Jonas why his rule was redundant. Client sign-off, debrief, XP.

### Validation-time failures (refused at Review + create)
| # | Trigger | Source |
|---|---|---|
| V1 | Subnet outside the VNet address space, or overlapping another subnet | Facts pass (VNet docs) |
| V2 | Subnet smaller than /29 | [S5] |
| V3 | Static private IP on a reserved address (first four, last) | [S5] |
| V4 | NIC/VM in West Europe on Mia's North Europe VNet | [S4] |
| V5 | Basic public IP (retired; Standard only) | [S3] |

### Go-live failures (deploy succeeds, then reality disagrees)
| # | Trigger | Symptom → evidence | Source |
|---|---|---|---|
| G1 | No NSG rule allows 443 | Availability red from the first probe. IP flow verify: denied by `DenyAllInbound` | [S1][S2][S3] |
| G2 | Subnet NSG allows 443 but a **NIC NSG** (e.g. one created with the VM) doesn't | Same symptom, but IP flow verify names the NIC NSG. Teaches "both must allow" | Evaluation [S1]. The portal creates `<vm>-nsg` on the NIC [S8]. **Uncertain:** exact current VM-wizard options and default rule → flag in AZURE_FACTS, verify against the portal flow on Learn |
| G3 | Data-subnet deny rule has a *lower number* than the 5432 allow | Game health endpoint returns 503 because the DB is unreachable. Availability red with message "503" | [S2] |
| G4 | SSH open to `Internet` | Not an outage: security review flag, client unhappy, Expert score penalty | Ticket requirement |

### Runtime incident R1: "hardening" gone wrong
- **Trigger:** after the healthy baseline, NPC *Jonas (external security consultant)* "hardens" `nsg-snet-game` by adding `Deny-Internet-Inbound`, priority **100**, Deny, any port, from `Internet`. It's a real operation in the Activity Log.
- **Symptom:** players already in matches keep playing (existing flows survive rule changes [S2]). New logins fail. Availability turns red from all locations, and the alert fires.
- **Evidence:** availability results show timeouts. The Activity Log shows a security rule written 2 sim minutes before the first failure, by Jonas. **IP flow verify** for TCP 443 inbound to `vm-game-01` shows *Access denied*, rule `Deny-Internet-Inbound`, NSG `nsg-snet-game` [S6]. Effective security rules show the ordering. On the canvas, the Internet → game edge turns red with the rule name.
- **Root cause:** a deny rule with a lower priority number matches before the HTTPS allow. First match wins [S2].
- **Fix:** delete the rule, or give it a priority after the allows. Best answer: delete it, since `DenyAllInbound` (65500) already denies everything not explicitly allowed [S2].
- **Validation:** IP flow verify allowed, availability green for 10 sim minutes, alert resolved. The completion check calls the same flow evaluator.

### Hint ladder (R1)
1. "People already playing are fine, only new connections fail. What kind of change affects only new connections?"
2. "Did anything change on the network around 21:38? Check the Activity log."
3. "Test TCP 443 from the internet to vm-game-01 with IP flow verify."
4. "NSG rules are processed by priority: lowest number first, and processing stops at the first match."
5. "Delete *Deny-Internet-Inbound*. `DenyAllInbound` already blocks everything you haven't explicitly allowed."

Build objectives use the same 5 levels: direction → concept → resource → action → exact step.

### Assistance modes
- **Guided:** technical requirements shown, next action highlighted, INFO opens the first time a concept appears, free hints, confirmation before destructive actions.
- **Standard:** business requirements + acceptance criteria, hints on request.
- **Expert:** ticket only. Hints cost score, and the review grades exposure, segmentation and alerting.

### INFO topics
Resource group · Region · Virtual network · Subnet (+ reserved addresses) · Network security group (priority, defaults, service tags, stateful) · NSG on subnet vs NIC · Public IP (Standard, secure by default) · Network interface · Virtual machine (image, size, SSH keys) · Application Insights availability test · Alerts · Activity Log · IP flow verify · Effective security rules.

### Monitoring signals
Availability results (per location, success, duration, failure message). VM platform metrics `Percentage CPU`, `Network In Total`, `Network Out Total` (exact names → AZURE_FACTS), driven by active sessions. Alerts. Activity Log. All derived from the flow engine + traffic model.

### Mission completion (state-based checks)
From `Internet`, only TCP 443 to the game VM and TCP 22 from the office IP are allowed (computed by the flow evaluator over all ports) ∧ DB VM has no public IP and accepts 5432 only from the game subnet ∧ everything in West Europe ∧ availability test + alert exist ∧ incident resolved per flow evaluator + availability ∧ post-incident note correct.

### Certification mapping (pin to current skills outlines, versioned, during the facts pass)
| Concept | Hands-on | Real world | Cert |
|---|---|---|---|
| RGs, regions | RG in West Europe, region trap | Data residency | AZ-900, AZ-104 |
| VNet/subnet design | Address plan, 2 subnets | Segmentation | AZ-104, AZ-700 |
| NSGs, public IPs | Rules, priorities, associations | Least exposure | AZ-104, AZ-700 |
| VMs | Linux VMs with SSH keys | Workload hosting (IaaS) | AZ-900, AZ-104 |
| Monitoring & diagnostics | Availability test, alert, IP flow verify | On-call, root-cause analysis | AZ-104, AZ-700 |

### Not in slice 1
Load balancers, NAT gateway, Bastion, managed databases, private endpoints, containers, storage, identity/RBAC, Git/Actions, Bicep editing, CLI, cost, governance.

### Simplifications to label in-game
The game API and PostgreSQL are modelled as services with health, not a simulated guest OS. TLS certificate assumed valid. Network Watcher assumed available in the region [S6].

**Mission 2 sketch, "Never again":** Lena wants network changes reviewed. The player brings the NSGs under Bicep in a repo, a GitHub Actions workflow deploys them, and a pull request with a priority conflict gets caught before it reaches production. That's where Git, PRs, YAML and Bicep become genuine. Details go through a facts pass first.

---

## H. UI/UX structure (workspace v1)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Cloud Engineer · PixelForge Games · Launch Day   ⏸ ▶ ▶▶  Fri 21:42  Guided ▾  XP │
├──────────────┬──────────────────────────────────────────┬────────────────────┤
│ QUEST        │ ARCHITECTURE CANVAS                       │ INSPECTOR          │
│ Ticket ✉     │  [Internet]──✗ 443 (Deny-Internet-Inb.)   │ nsg-snet-game  ⓘ   │
│ Stage 5/8    │      │                                    │ Inbound rules      │
│ Objectives   │  ┌ rg-pixelforge-prod ────────────────┐   │ 100 Deny  * Inet ⚠ │
│  ✓ …         │  │ ┌ vnet-pixelforge ──────────────┐  │   │ 200 Allow 443 Inet │
│  ○ …         │  │ │ ┌ snet-game [nsg]┐ ┌ snet-data [nsg]┐│ │ 210 Allow 22 office│
│ Hints 2/5    │  │ │ │ [vm-game]●──5432──►[vm-db]●     ││  │ 65000… defaults    │
│ INFO         │  │ │ └────────────────┘ └────────────────┘│ │ Associations       │
│              │  │ └───────────────────────────────┘  │   │ Effective rules    │
│              │  │  [law] [appi] [alert]               │   │                    │
│              │  └────────────────────────────────────┘   │                    │
│              │  + Create resource   Layers: Network · Security · Health        │
├──────────────┴──────────────────────────────────────────┴────────────────────┤
│ Deployments │ Activity log │ Availability │ Metrics │ Alerts (1) │ Network Watcher │
└──────────────────────────────────────────────────────────────────────────────┘
```
- **Canvas v1 (XYFlow), designed through our `visual-infrastructure` skill:** containment (RG → VNet → subnet), NSG badges on subnets and NICs, public IP attached to the NIC, the client's North Europe test RG dimmed, an Internet node. **Edges = derived dependencies + computed traffic paths**: Internet → game :443, game → db :5432, office → game :22. Each traffic edge is coloured by the *flow evaluator* result and names the deciding rule. Status colours: healthy, deploying, degraded, failed. Click opens the inspector. Layers: network, security, health. Auto-layout from containment, with manual drags saved only in UI state.
- **Inspector:** reads the same world. NSG rule tables show defaults greyed. Edits go through Review + create. Health lists `reasons` with links to evidence.
- **Network Watcher panel:** IP flow verify form (direction, protocol, local/remote IP and port) with a result exactly as Learn describes [S6], plus effective security rules per NIC.
- **Bottom panel:** only tools that work. Terminal, Git and Pipeline appear when they're real.
- **Time controls:** pause / 1× / fast-forward.
- **Tone:** calm, professional, colour used for state signals. Before using the official Microsoft Azure architecture icons, read their usage terms.

---

## I. Development sequence

| # | Step | Visible result |
|---|---|---|
| 0 | `docs/AZURE_FACTS.md` for the slice: VNet/subnet, NSG, public IP, NIC, VM, availability tests, alerts, Activity Log, IP flow verify. Each rule has a Learn URL, uncertain ones flagged | Sourced spec |
| 1 | `git init`, Vite + React + TS (strict), ESLint, Vitest, import-boundary check, CI (typecheck/test/build), Pages deploy of an empty shell | **M0: live URL** |
| 2 | Engine core: world types, clock, seeded RNG, `step()`, command pipeline, Activity Log, save/load v1 | Tests only |
| 3 | Store + tick loop + time controls + workspace skeleton | Clock running in the app |
| 4 | Control-plane operations for the slice's resource types (validation V1–V5, refusals with rule IDs) | Review + create forms work |
| 5 | **Network flow engine** + IP flow verify + effective security rules (heavily unit-tested against the Learn scenarios [S1]) | Network Watcher panel answers correctly |
| 6 | Deployment engine + Deployments panel | Resources provision over time |
| 7 | **Write the `visual-infrastructure` skill** (what the canvas must answer, containment and edge rules, status language, accuracy constraints such as "draw traffic only from the flow evaluator"), then canvas v1 + inspector v1 | **M1: build, deploy and *see* it** |
| 8 | Runtime (VM/service health, traffic, sessions) + availability tests + metrics + alerts | **M2: it runs and you can see it** |
| 9 | Mission engine + PixelForge mission data + a **test that plays the whole mission headless**, incident included | Mission passes in CI |
| 10 | Quest panel, modes, hint ladders, INFO | **M3: playable slice** |
| 11 | Minimal progression + Playwright smoke test on the Pages build | Shippable |
| next | Mission 2 (Bicep + Actions + PR review), View as Bicep, then containers | |

The flow engine (5) comes before the canvas (7) because the canvas draws traffic only from it. The skill comes right before the canvas, so it's written with a working engine in front of us rather than in the abstract.

---

## J. Architecture risks (expensive to change later)

1. **Mixing desired and actual state**: separate them now.
2. **Non-determinism**: sim clock + seeded RNG from step 2.
3. **Faults as flags**: faults only via operations or external conditions.
4. **More than one source of reachability**: if the canvas, IP flow verify, probes or missions compute connectivity separately, they *will* drift. One flow evaluator only.
5. **Stored dependencies**: derive them.
6. **Invented property names**: ARM names wherever modelled (e.g. `securityRules[].properties.priority`, `destinationPortRange`).
7. **Statelessness shortcuts**: ignoring flow state makes "existing players fine, new ones fail" impossible, and that's a core realism point [S2]. Model flow records from v1.
8. **Telemetry in saves**: ring buffers, `schemaVersion` from v1.
9. **Re-rendering per tick**: store selectors, coarse sim steps, throttled UI.
10. **Name-prescriptive validation**: check exposure and relationships, not names.
11. **Portal fidelity**: our wizard flow must match what Learn documents (e.g. the NIC NSG the VM wizard creates [S8]). Where Learn is vague, label the simplification instead of inventing it.
12. **Scope creep in the slice**: every extra resource type multiplies validation, runtime, telemetry, INFO and tests. Hold the line in G.
13. **GitHub Pages base path**: `base: '/cloud-engineer-sim/'`. Client-side routes need hash routing or a 404 fallback.

---

## K. Open questions

1. **Repo visibility:** public or private on GitHub? Pages on a private repo needs GitHub Pro or higher [S11].

Everything else needed for steps 0–2 is decided.

---

## Sources

- [S1] Microsoft Learn — How network security groups filter network traffic (inbound: subnet then NIC; outbound: NIC then subnet; both must allow; no NSG = blocked): https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works
- [S2] Microsoft Learn — Network security groups overview (priority 100–4096, first match, default rules, service tags, stateful flows, rule changes affect only new connections): https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview
- [S3] Microsoft Learn — Public IP addresses (Standard SKU closed to inbound unless NSG allows; Basic retired 2025-09-30): https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/public-ip-addresses
- [S4] Microsoft Learn — Virtual networks and virtual machines in Azure (NIC same location/subscription as VM and VNet): https://learn.microsoft.com/en-us/azure/virtual-machines/network-overview
- [S5] Microsoft Learn — Azure Virtual Network FAQ (5 reserved addresses per subnet, /29 smallest subnet, VNet limited to one region): https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq
- [S6] Microsoft Learn — IP flow verify overview (inputs, Access allowed/denied + rule + NSG): https://learn.microsoft.com/en-us/azure/network-watcher/ip-flow-verify-overview
- [S7] Microsoft Learn — Application Insights availability tests (standard tests, ≥5 locations recommended, alerts): https://learn.microsoft.com/en-us/azure/azure-monitor/app/availability
- [S8] Microsoft Learn — VM network overview (portal auto-creates the NIC and an NSG `<vm>-nsg` on it): https://learn.microsoft.com/en-us/azure/virtual-machines/network-overview
- [S9] Microsoft Learn — Quickstart: Linux VM in the portal (SSH public key, generate key pair, public inbound ports): https://learn.microsoft.com/en-us/azure/virtual-machines/linux/quick-create-portal
- [S10] Microsoft Learn — Container Apps: securing with NSGs (external workload-profile inbound bypasses subnet NSG), for later container missions: https://learn.microsoft.com/en-us/azure/container-apps/firewall-integration
- [S11] GitHub Docs — What is GitHub Pages (Free = public repos only): https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- Also checked: default outbound access (new VNets default to private subnets for API versions after 2026-03-31; explicit outbound methods), relevant to the DB VM having no internet path: https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/default-outbound-access
