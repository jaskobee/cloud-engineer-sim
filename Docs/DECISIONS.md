# Decisions

Locked choices with their reasons. To change one, discuss it first and record the new decision here.
Newest first within each section.

## Product

| ID | Date | Decision | Why |
|---|---|---|---|
| D-4 | 2026-10-08 | We write our own `visual-infrastructure` skill, before building the canvas (step 7) | The canvas is the product's main debugging/learning surface. Its rules should be explicit and reviewable |
| D-3 | 2026-10-08 | Azure accuracy comes from **Microsoft Learn**. Every enforced rule is cited in `AZURE_FACTS.md`. Uncertain points are flagged and not implemented as stated | The player must never learn something they'd have to unlearn for a certification or the job |
| D-2 | 2026-10-08 | The first vertical slice uses **Virtual Machines** (Container Apps later) | Simpler to model. NSG troubleshooting is accurate for VMs (it isn't for external Container Apps environments, see ACA-1) |
| D-1 | 2026-10-08 | Repo `cloud-engineer-sim`, **public**, built from scratch in the `Cloud-Engineer` folder, deployed to GitHub Pages | Free Pages hosting needs a public repo. The product is technically independent of NetSim |

## Technical

| ID | Date | Decision | Why |
|---|---|---|---|
| T-7 | 2026-10-08 | Step 4 is split: **4a** the Azure control plane in the engine (network resource types, validation, refusals, activity log, tests) and **4b** the portal-style *Create a resource* forms (Review + create = `dryRun`). VMs, OS disks and the monitoring resources follow as their own step. Resources are stored under their lower-cased ARM ID; subnets and security rules are separate child resources | Keeps each commit reviewable. Case-insensitive keys follow NAME-6. Child resources give subnets and rules their own IDs and activity log entries, as in Azure |
| T-6 | 2026-10-08 | The simulation runs only while the game is open and visible: the tick loop counts at most 250 ms of real time per frame, so a hidden tab or a sleeping laptop pauses the world instead of fast-forwarding it. The store commits time in ~100 ms batches. One browser save slot, written every 15 s of play and when the page is hidden or closed. On start the player chooses **Continue** or **New game**; nothing is restored silently. Only the world is saved for now (session/UI state from step 10) | MVP §19 (infrastructure runs only while the session is active). Batching is exact because of T-5 and keeps React to ~10 renders per second. Saving on hide covers closing the tab |
| T-5 | 2026-10-08 | The engine runs on a fixed 1 s sim tick: `step(world, dt)` runs every system once per tick boundary crossed, so the result doesn't depend on how time is sliced (frame rate, fast-forward). The world carries two RNG streams: `game` for gameplay and `ids` for GUIDs | Replays, saves and headless mission tests give identical worlds. Issuing an extra command never shifts gameplay randomness |
| T-4 | 2026-10-08 | World save schema stays at **v1 until the first playable release (M3)**. Until then, shape changes need no migration: an old dev save simply fails to load as `not-a-world`. From M3 on, every breaking change bumps `WORLD_SCHEMA_VERSION` and adds a migration in `src/engine/save.ts` | Avoids writing migrations for saves nobody has yet, while the loader, version check and migration hook already exist |
| T-3 | 2026-10-08 | One CI workflow: verify on every push/PR, deploy `main` to Pages | One place to read, and deploy only ever ships verified builds |
| T-2 | 2026-10-08 | Engine boundary enforced by a test: no UI imports, no wall-clock time, no unseeded randomness in `src/engine` | Determinism and headless testability are the foundation of causal simulation |
| T-1 | 2026-10-08 | Vite 8, React 19, TypeScript 6.0 (not 7: typescript-eslint supports `<6.1.0`), Vitest 5, ESLint 10. Zustand, XYFlow and Playwright are added when their step needs them | Current stable versions, with nothing installed before it's used |
