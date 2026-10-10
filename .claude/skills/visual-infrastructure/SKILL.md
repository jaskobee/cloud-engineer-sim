---
name: visual-infrastructure
description: Use when building or changing the architecture canvas, the resource inspector, or anything else in cloud-engineer-sim that draws the simulated Azure infrastructure — nodes, groups, edges, traffic paths, status, layers or layout.
---

# Visual infrastructure

> **v1.0 (2026-10-10).** Agreed with Jasko: decisions D-4 and D-5 in `Docs/DECISIONS.md`.

## Overview

The canvas is a **debugging instrument that reads the world**, not a drawing tool. Every node, edge,
colour and label is derived from the world on each render. The canvas owns exactly one thing: where
the player put boxes on the screen.

If something on the canvas can't be traced back to a resource property, a runtime value or a result
of `azure.evaluateFlow`, it doesn't belong on the canvas.

## The questions the canvas must answer

This is the acceptance test for any canvas change (INSTRUCTIONS §13, MVP §5):

| Question | Shown by | Comes from |
|---|---|---|
| What exists? | A node per resource | `world.tenant.resources` |
| Where does it live? | Nesting: resource group → VNet → subnet | ARM IDs and `subnet.id` references |
| What talks to what? | Traffic edges for watched flows | `azure.evaluateFlow` (one evaluator, CLAUDE.md rule 5) |
| What depends on what? | Association edges (NSG, public IP, OS disk, NIC) | `azure.dependenciesOf` (derived, rule 6) |
| What is unhealthy or still deploying? | Status treatment on the node | `provisioningState` + `world.runtime` |
| Where is the network boundary? | The VNet and subnet outlines, the Internet node outside them | VNet and subnet resources |
| What changed? | Selecting a node shows its latest activity log entry and deployment | `world.activityLog`, `world.deployments` |

## Data contract

One pure function builds everything the canvas draws:

```ts
// src/ui/canvas/graph.ts — pure, no React, unit-tested headless
buildCanvasGraph(world: World, watched: readonly WatchedFlow[])
  → { boxes: CanvasBox[]; nodes: CanvasNode[]; edges: CanvasEdge[] }   // layers don't change the data
```

- **Groups and nesting** come from ARM IDs and references: resource group, then VNet, then subnet.
- **Association edges** come from `azure.dependenciesOf` / `allDependencies` (engine, `src/engine/azure/dependencies.ts`),
  which read only stored references: subnet → NSG, NIC → subnet / public IP / NSG, VM → NIC / OS disk. The same
  function will drive deployment ordering and delete protection.
- **Traffic edges** come from `evaluateWatchedFlow` in `graph.ts`, which only calls `azure.ipFlowVerify` (and so
  `evaluateFlow`): once for the watched VM, and once more for the other end when it's a VM too (sender outbound,
  receiver inbound, NSG-7). The UI never matches rules itself.
- **Status** comes from `provisioningState` and `world.runtime` (power state, health, reasons).
- **Layout** is computed by the auto-layout (D-5). View state (active layer, pinned flows) lives in
  `session.ui.canvas` only. It's never part of the world and never part of a mission check (MVP §27).

React components only render that result (`ArchitectureCanvas.tsx`, `CanvasNodes.tsx`, `CanvasEdges.tsx`).
Subscribe to `tenant`, `runtime` and the watched flows, never to `clock.now`, so the canvas doesn't re-render
every tick. Traffic labels are HTML in React Flow's label layer, so a box can't clip them.

## Drawing Azure accurately

| Thing | Draw it as | Never | Rule |
|---|---|---|---|
| Resource group | A labelled scope box | A region box: its location is only where its metadata lives | RG-1 |
| Virtual network | A box inside its resource group, labelled with address space and region | Spanning regions | VNET-1 |
| Subnet | A band inside its VNet, labelled with CIDR (usable count on hover) | Outside its VNet | SUB-2, SUB-4 |
| NSG | Its own node in the resource group, plus a badge on every subnet and NIC it's associated with | A box *around* VMs, as if traffic passes through a container | NSG-12 |
| NIC + VM | One unit inside the NIC's subnet: the VM's name, size and power state, with the NIC's name and private IP on it (D-5) | A VM with no NIC, or one placed in a subnet its NIC isn't in | NIC-1, NIC-2 |
| Public IP | Attached to the NIC's IP configuration, facing the Internet node | Inside a subnet | PIP-8 |
| OS disk | Attached to its VM, outside the network boxes | A network participant | VM-15s |
| Internet | One external node outside every Azure box | An Azure resource | NSG-15 |
| Inbound path | Internet → public IP → subnet NSG → NIC NSG → VM | Any other order | NSG-7, NSG-14 |
| External Container Apps (later) | Public endpoint straight to the environment | Through the subnet NSG | ACA-1 |

Write names the way Azure does. Use the default rule names from NSG-3, and say "made up" where the simulator
invents a value (deployment durations, documentation-range IPs).

## Visual grammar

**Status.** Every state uses text or a symbol as well as colour, and only the colour tokens in `app.css`:

| State | Treatment |
|---|---|
| Creating / Updating / Deleting | `--state-warn` dashed outline, label "Creating…" etc. |
| Succeeded, running, healthy | Neutral node, `--state-ok` dot |
| Degraded / attention | `--state-warn` outline and a reason on hover |
| Failed / unhealthy / traffic denied | `--state-bad` outline or edge and a reason ("Denied by Deny-Internet-Inbound") |
| Stopped / deallocated | Muted node, power state as text |
| Not modelled | Muted, dotted, labelled "not modelled", with the rule ID on hover |
| Selected / actionable | `--accent` |

**Edges** come in exactly three kinds:
1. **Containment** isn't drawn as an edge. Nesting shows it.
2. **Association** (NSG on a subnet, public IP on a NIC, OS disk on a VM): thin, neutral, dashed. Label on hover.
3. **Traffic** (a watched flow): solid with an arrow and a `protocol/port` label, coloured by the verdict. A
   denial names the deciding rule and NSG. A refusal from the evaluator is drawn as "not modelled", never as
   allowed or denied.

**Icons.** Microsoft's Azure architecture icons may be used "in architectural diagrams, training materials, or
documentation", unmodified (no cropping, flipping, rotating or reshaping), with the product name close to the
icon ([Azure architecture icons](https://learn.microsoft.com/en-us/azure/architecture/icons/)). Put the official
SVGs, unmodified, in `public/azure-icons/` and map resource types to file names in one place. The type label
always stays as text beside the icon, and a node without an icon file shows only the label (D-5).

## Watched flows

The canvas doesn't draw every possible connection. It draws **watched flows**:
- the flows a mission declares the client depends on (PixelForge: players → game 443, office → game 22,
  game → database 5432);
- flows the player pins from IP flow verify.

Never infer traffic edges from NSG rules. A rule says what's *permitted*, not what's *happening*.

## Layers

Layers change emphasis, never data:
- **Network** (default): nesting and traffic edges.
- **Security**: NSG badges and associations, deciding rule names on traffic edges.
- **Health**: status treatments stand out, healthy nodes dim.

## Interaction

- Click a node or edge to select it. `store.select(id)` opens the inspector. A traffic edge opens its verdict
  with the stages in order, like IP flow verify.
- Hovering shows the reason behind any status.
- Every node can be reached with the keyboard, and Enter selects it.
- Zoom and pan. Fit to view on first load.
- **Auto-layout only in v1 (D-5):** positions come from a deterministic layout of the nesting, so the same world
  always draws the same way. No dragging yet. When dragging arrives, positions go in `session.ui.canvas` only.
- **Narrow screens (below 900 px):** the resource list replaces the canvas (D-5). Both read the same world.
- Guided mode can ask for one node or flow to be highlighted. The highlight is UI state, never world state.

## Before you finish canvas work

1. `graph.test.ts` passes: fixture worlds give the expected nodes and edges; every traffic edge equals
   `evaluateFlow` for its flow; a deleted resource disappears; Creating resources show their state; no
   association edge exists without a stored reference.
2. The PixelForge incident reads correctly. After Jonas's rule, the Internet → game edge is red and names
   `Deny-Internet-Inbound`. Deleting the rule turns it back once the delete has succeeded (ARM-14s).
3. Browser check in light and dark and at 390 px: no console errors, no horizontal scroll, keyboard selection works.
4. The canvas doesn't re-render on clock ticks.
5. `npm run check` is green.

## Red flags

Stop if you find yourself:
- matching NSG rules, prefixes or ports in UI code (call `azure.evaluateFlow`);
- adding edges, positions or highlights to the world;
- drawing an NSG as a container, or a resource group as a region;
- showing status by colour alone;
- animating "traffic" that no watched flow backs;
- drawing a refused flow as allowed or denied;
- recolouring, cropping or relabelling an Azure icon.

## Decisions behind this skill (D-5)

Icons when available (text labels until then) · watched flows only (mission-declared + pinned from IP flow
verify) · VM drawn inside its NIC's subnet · auto-layout only in v1 · resource list below 900 px · layers
Network / Security / Health.
