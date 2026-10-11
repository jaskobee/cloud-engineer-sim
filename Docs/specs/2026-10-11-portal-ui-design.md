# Portal-style UI and UX: design (2026-10-11)

Status: **approved in chat by Jasko on 2026-10-11**. This spec records that design; review it before implementation starts.
It becomes decision D-7 once implemented.

## 1. Why

Jasko's playtest verdict: "the UI currently is really bad … it needs to be a lot more like the actual Azure portal so that
the users get used to the workflow already."

The current UI puts everything on one screen: quest pane, canvas, inspector and seven bottom tool tabs. It uses 16 px text,
and creation happens in a narrow side pane.

The portal works differently. You search or open a service list, then select **+ Create**, go through a tabbed wizard,
select **Review + create** and then **Create**. A notification follows, with **Go to resource**. That opens the resource
page, with its service menu, command bar and Essentials.

The habit we want players to form *is* that workflow. If they've only played the simulator, they should still find their
way in the real portal.

**Success criteria**
1. A player who finished mission 1 can do the same task in the real portal without having to look for where things are:
   - search, or a service list, then + Create and the wizard;
   - Review + create, the notification and Go to resource;
   - the service menu (Subnets, Inbound security rules, Effective security rules, Metrics, Activity log, Availability,
     Alerts, IP flow verify, Topology).
2. Every portal label the game shows (menu items, tab names, button names, paths) is backed by a register rule that
   cites Microsoft Learn (§6). The game shows no portal label it can't back up.
3. The game layer (ticket, clock, map, hints) is always reachable. It never covers the portal workflow and never
   pretends to be part of the portal.
4. The site can't be mistaken for the real portal: no Microsoft logo, no "Microsoft Azure" wordmark, and a visible
   **Simulation** badge.

**Decisions taken in chat (2026-10-11)**

| Question | Answer |
|---|---|
| Scope | Full portal shell: header, portal menu, Home, service lists, resource pages with service menu and Essentials, a full-page create wizard and notifications. The game layer docks into it |
| Canvas | "There should be an icon on the page where the player can switch to the visual map and get an understanding of how the infrastructure works" |
| Ticket | Docked right pane that collapses to a strip |
| Guided | Real portal paths in objectives and hints. The next control is highlighted in Guided, paths appear in hints in Standard, and Expert never shows them |
| Build | Fluent UI React v9 (`@fluentui/react-components`, `@fluentui/react-icons`, both MIT) |

## 2. Research basis

These are the public Microsoft sources used. I can't sign in to a real portal from the container.
- [What is the Azure portal?](https://learn.microsoft.com/azure/azure-portal/azure-portal-overview) (Learn, 2026-01-26).
  It names these elements: portal menu (flyout or docked; *Create a resource*, *Favorites*), breadcrumb, page header,
  global search, Copilot, global controls (Cloud Shell, Notifications, Settings, Support + Troubleshooting, Feedback),
  your account, command bar ("contextual to your current focus"), service menu ("Sometimes referred to as the resource
  menu"; search box, collapsible groups) and working pane. **Home** shows *Create a resource*, services and recently
  visited resources.
- [Quickstart: Windows VM in the portal](https://learn.microsoft.com/en-us/azure/virtual-machines/windows/quick-create-portal)
  (Learn, 2026-03-27): search, the service list, **Create** → *Virtual machine*, **Review + create**, validation,
  **Create**, then **Go to resource**.
- [Deploy resources with ARM templates and the portal](https://learn.microsoft.com/en-gb/azure/azure-resource-manager/templates/deploy-portal)
  (Learn, 2026-06-26): "When the deployment has finished, you see a notification. Select **Go to resource** …"
- [View topology](https://learn.microsoft.com/en-us/azure/network-watcher/view-network-topology) (Learn, 2025-11-18):
  Network Watcher → **Monitoring** → **Topology**, and Virtual networks → **Monitoring** → **Diagram**.
- [Declarative resource Overview](https://github.com/Azure/portaldocs/blob/master/portal-sdk/generated/portalfx-declarative-overview.md)
  (Azure/portaldocs). Essentials shows "Resource Group, Location, Subscription, Subscription ID and Tags" by default.
- [Fluent 2 typography](https://fluent2.microsoft.design/typography): Segoe UI, Body 1 is 14/20 px, Caption 1 is
  12/16 px, Subtitle 1 is 20/26 px, Title 3 is 24/32 px.

**Open (Jasko's own portal screenshots would settle these):** the header colours, the exact search placeholder, and the
Essentials layout on a VM and an NSG. Until then we use the Fluent theme defaults and leave out text we can't confirm.

## 3. Layout

```
┌ ≡  Cloud Engineer Simulator [Simulation]   [ Search ]    🗺 Map  🔔  ⚙  ?  you@…  │ Fri 17:00  ▶ 1× 4× 16× ┐
│ Home > Network security groups > nsg-web                                                              │
├──────────────────┬──────────────────────────────────────────────────────────────┬──────────────────────┤
│ 🔍 Search         │ nsg-web | Inbound security rules                             │ TICKET            »  │
│ Overview         │ Network security group                                       │ PixelForge           │
│ Activity log     │ + Add  ↻ Refresh                                             │ Stage 1/5 · Build    │
│ ▾ Settings       │ Priority  Name            Port  Protocol  Source  Dest  Action│ ☐ Players on 443     │
│   Inbound sec…  ◀│ 100       Allow-HTTPS     443   TCP       Any     Any   Allow │   Path: NSGs › …     │
│   Outbound sec…  │ 65000     AllowVnetInBound …                                 │ ☐ DB private         │
│   Subnets        │ …                                                            │ ✉ Messages (1)       │
│   Network inter… │                                                              │                      │
└──────────────────┴──────────────────────────────────────────────────────────────┴──────────────────────┘
        service menu                      working pane (command bar, content)          ticket pane (game)
```

**Page header** (left to right):
- **≡** opens the portal menu.
- The product name **Cloud Engineer Simulator** and a **Simulation** badge.
- Global search.
- **Map** toggle (game).
- **Notifications**.
- **Settings**: theme (Light, Dark, or follow the system).
- **Help**: INFO topics and Concepts.
- The player's account in the story: their name and the client tenant.
- The clock and speed controls, visually set apart as game controls.

Copilot, Cloud Shell, Support + Troubleshooting and Feedback are **left out**, not shown as fakes. Only tools that work are
shown (as CLAUDE.md already says for the bottom panel).

**Breadcrumb**: derived from the route (§5), for example `Home > Resource groups > rg-pixelforge > vm-game-01`.

**Portal menu**: a flyout. It has *Create a resource*, *Home*, *All services* (the sim's services only) and *Favorites*:
- All resources
- Resource groups
- Virtual machines
- Virtual networks
- Network security groups
- Public IP addresses
- Network interfaces
- Monitor
- Network Watcher
- Log Analytics workspaces
- Application Insights

**Ticket pane**:
- Docked right, about 320 px wide.
- It collapses to a 48 px strip showing the stage number and an unread badge.
- Content is today's `QuestPanel`: stages, goal, objectives per mode, hint ladders, inbox, post-incident note, completion
  with the review, XP and career.
- In sandbox mode it shows a short "No client assigned" card.

**Narrow screens (< 900 px)**:
- The portal menu stays a flyout.
- The service menu becomes a "Menu" dropdown above the working pane.
- The ticket becomes a drawer opened from a header button.
- The map shows the resource list instead (D-5 rule 5).

## 4. Pages

All pages are in the working pane. Each page has a title (`name | Section`), a subtitle with the resource type, a command
bar and its content.

| Page | Content | Reuses |
|---|---|---|
| **Home** | "Azure services" row (Create a resource + supported services); Recent resources (session) | `App.tsx` career card stays on the start screen |
| **Service list** (`browse`, per type, and *All resources*, *Resource groups*) | Command bar: **+ Create**, **Refresh**. Filter box. Grid: Name, Type (All resources only), Resource group, Location, Subscription. Status badges (`Creating…`) | `ResourceList.tsx` logic |
| **Resource page** | Service menu with search box and groups. Overview: command bar + **Essentials** (Resource group, Location, Subscription, Subscription ID, Tags, then type-specific fields) and a Properties section. Other sections below | `Inspector.tsx` details split per type |
| **Create wizard** (full page) | Tabs, **Basics** first: *Project details* (Subscription, Resource group with *Create new*), then *Instance details*. Further tabs only where the sim models their settings; tabs that would be empty are left out. A **Review + create** tab runs `store.check` (dry run) and shows "Validation passed" or the refusal (`RefusalNotice`). Footer: **Review + create**, **Previous**, **Next**, then **Create** | `CreatePanel.tsx` forms and command builders, `ReviewCreate.tsx` |
| **Deployment page** | After Create: in progress → succeeded / failed, with deployment name, resources and **Go to resource** | `DeploymentsPanel.tsx` data |
| **Context pane** (side sheet over the working pane) | Child resources edited in place: *Add inbound security rule*, *Add subnet*, *Edit*; the same Review flow as the wizard (dry run, then save) | security rule and subnet forms |
| **Map** (via header toggle) | The architecture canvas, filling the working pane: layers, traffic lanes, watched flows, the current resource highlighted. Clicking a node opens its resource page. Toggling again returns to where you were | `ArchitectureCanvas` (lazy), `FlowInspector` in a context pane |

**Service menu per type.** Every label still needs a PORTAL rule before it ships (§6). Items without one are left out.

| Type | Sections (mapped to features we have) |
|---|---|
| Resource group | Overview (its resources), Activity log, Deployments |
| Virtual network | Overview, Activity log; *Settings*: Address space, Subnets; *Monitoring*: Diagram (map, filtered) |
| Network security group | Overview, Activity log; *Settings*: Inbound security rules, Outbound security rules, Network interfaces, Subnets |
| Public IP address | Overview, Activity log |
| Network interface | Overview, Activity log; *Settings*: IP configurations; Effective security rules |
| Virtual machine | Overview (power state, simulated app), Activity log; *Networking*: Network settings; *Monitoring*: Metrics |
| Log Analytics workspace | Overview, Activity log |
| Application Insights | Overview, Activity log; *Investigate*: Availability; *Monitoring*: Alerts |
| Availability test / alert rule | Overview (opened from App Insights → Availability / Monitor → Alerts) |
| **Monitor** (service) | Overview, Activity log, Alerts, Metrics |
| **Network Watcher** (service) | Overview; *Monitoring*: Topology (the map); *Network diagnostic tools*: IP flow verify; Effective security rules |

**Notifications** (bell, newest first, unread count):
- Deployment started, succeeded or failed, with **Go to resource**.
- Alert fired or resolved.
- New ticket messages: these are labelled as from the client, not from Azure.

Notifications are derived from the world (deployments, `world.alerts`, `world.mission.messages`). Only "seen up to" is
stored in the session (rule 6: derived, never stored separately).

**Removed**:
- the right inspector pane and the bottom tool tabs;
- the canvas as the permanent centre.

Their content moves to the pages above, where the real portal keeps it.

## 5. Architecture

- **Dependencies:** `@fluentui/react-components` and `@fluentui/react-icons` at exact versions. (`@fluentui/react-components`
  9.74.9 supports React `>=16.14 <20`, from `npm view`.) Renovating them is a deliberate step.
- **Theme:** a `FluentProvider` with `webLightTheme` / `webDarkTheme`, following `prefers-color-scheme` unless Settings
  overrides it. The choice is stored as a per-browser convenience (guarded localStorage, like T-6). Our own CSS reads
  Fluent tokens (`tokens.*`) instead of the current custom properties.
- **Routing** (`src/ui/portal/route.ts`, pure, tested headless):
  ```ts
  type Route =
    | { page: 'home' }
    | { page: 'browse'; type: string }                       // ARM type, or 'all' | 'resourceGroups'
    | { page: 'resource'; id: ArmId; section: string }        // section id from the service menu
    | { page: 'service'; service: 'monitor' | 'networkWatcher'; section: string }
    | { page: 'create'; kind: ResourceKind; tab: string; preset?: Record<string, string> }
    | { page: 'deployment'; id: string }
  ```
  - `session.ui.nav = { route, back: Route[], map: boolean, contextPane: ContextPane | null, ticketOpen: boolean, notificationsSeenAt: number }`.
  - `navigate(route)`, `goBack()`, `toggleMap()`, `openContextPane()` / `closeContextPane()`.
  - `breadcrumbFor(route, world)` is derived, never stored.
  - `selectedId` and `creating` give way to the route. The canvas selects by navigating.
  - Bottom tabs (`bottomTab`) are removed.
  - Browser history / URL hash sync is not in scope (YAGNI). The back stack covers it.
- **Service menus are data** (`src/ui/portal/menus.ts`). Per ARM type: groups → items `{ id, label, rule }`. `rule` is the
  PORTAL rule ID that backs the label, and a test fails if it's missing or not in the register (like `facts.test.ts`).
- **Wizards are data plus form parts** (`src/ui/portal/create/*.tsx`, one file per resource family). Each gives
  `{ tabs: [{ id, label, rule, fields }], toCommand(values) }`. Today's command builders move here unchanged, so dry runs
  and refusals behave exactly as before.
- **The engine and missions don't change**, apart from the mission-data additions in §7. UI-only changes don't touch
  `src/engine`.
- The **canvas** keeps `buildCanvasGraph` and follows the visual-infrastructure skill. The skill gets a v1.1 note: the
  canvas is opened by the Map toggle and from Topology / Diagram, and the "inspector" is now the resource page or a
  context pane.

## 6. Accuracy: PORTAL rules

New register section in `Docs/AZURE_FACTS.md`: **PORTAL — Azure portal navigation and labels**.
- Each rule states a label, path or behaviour the game shows, cites a Learn page and quotes it. Example: PORTAL-1:
  "Network Watcher → Monitoring → Topology", from L-TOPOLOGY.
- The status levels are the same as everywhere: VERIFIED, `s` for a simplification (e.g. "tabs whose settings the sim
  doesn't model are left out"), and UNCERTAIN, which means the label isn't shown.
- `tests/facts.test.ts` already fails on unknown rule IDs. The new `menus.test.ts` also fails if a menu item, tab or path
  step has no rule.
- `.claude/agents/azure-qa.md` gets PORTAL labels added to its scope.
- Learn drift covers the new source pages automatically, because they're cited in the register.

## 7. Game layer

**Map toggle**:
- `nav.map = true` swaps the working pane for the canvas. The breadcrumb shows `… > Map`.
- The route is kept, so toggling back returns there.
- The highlighted node is the route's resource, if there is one.
- Topology (Network Watcher) and Diagram (VNet) open the same canvas, filtered to their scope. Those are the real portal
  places for it.

**Portal paths** (Guided):
- `ObjectiveDef.portalPath?: PathStep[]` and an optional `HintDef.portalPath`.
- A `PathStep` is `{ label, target }`. `target` is a `Route` or a highlight anchor (`data-guide="nsg:inbound:add"`), and
  every label is backed by a PORTAL rule (tested).
- Guided shows the path under the objective. Each step is clickable (it navigates), and the next control on the current
  page gets a soft outline ring, not an overlay.
- Standard shows paths only inside revealed hints. Expert never shows them.
- Mission 1 gets paths for its 7 objectives and the incident hints.

**Clock**: `TimeControls` moves into the header, restyled. Its behaviour doesn't change.

**SIM labels**: everything that isn't a real portal element (Map, ticket, clock, simulated app, made-up durations) keeps
its existing Simulator label.

## 8. Testing

**Unit (Vitest)**:
- `route.ts`: navigation, back stack, breadcrumbs.
- `menus.ts`: every item has a known PORTAL rule; every section id renders a page.
- Wizard definitions: each `toCommand` matches what today's forms dispatch, so the commands don't change.
- Notifications derivation.
- Mission data: every portal path step has a rule and a resolvable target.

**E2E (`e2e/smoke.e2e.ts`, rewritten for the new shell)**:
- start → take the job → ticket pane;
- search "virtual networks" → list → + Create → wizard → Review + create → Create → notification → Go to resource;
- NSG → Inbound security rules → + Add (context pane);
- Map toggle round trip;
- Network Watcher → IP flow verify;
- save and continue;
- 390 px without horizontal scroll;
- no console errors.

**Visual**: screenshots in light, dark and at 390 px after every step. They're checked by eye against the layout in §3.

**Mission**: `tests/missions/pixelforge.test.ts` is unchanged (headless). The quest content still renders inside the
ticket pane.

## 9. Build order

Each step is one or more commits with `npm run check` and the e2e test green, plus screenshots.

| Step | Delivers |
|---|---|
| R1 | Fluent dependencies and theme; shell (header, portal menu, breadcrumb, ticket pane, clock in header); `route.ts`; Home; Settings theme. The old canvas, inspector and bottom tabs temporarily become pages, so nothing is lost |
| R2 | PORTAL rules, first batch (navigation, lists, networking menus); service lists; resource pages with service menu, command bar and Essentials for resource groups and networking types |
| R3 | Create wizards (Basics / … / Review + create), deployment page, notifications, context panes for security rules and subnets |
| R4 | VM, Monitor, Network Watcher and App Insights pages; Map toggle, Topology and Diagram; the old inspector and bottom tabs removed; e2e rewritten |
| R5 | Guided portal paths and highlights; mission 1 paths; PORTAL rules for them |
| R6 | D-7 in DECISIONS.md, visual-infrastructure skill v1.1, CLAUDE.md section, azure-qa scope, STATUS; azure-qa run on the PORTAL rules |

## 10. Out of scope

- A real-portal clone: no Marketplace, Cost Management, IAM or Policy, and no pages for unmodelled types.
- Copilot, Cloud Shell, CLI and Bicep (Bicep is mission 2).
- URL deep links.
- Draggable canvas.
- The pending QA audit fixes (after the playtest).
