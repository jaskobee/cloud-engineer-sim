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
| T-5 | 2026-10-08 | The engine runs on a fixed 1 s sim tick: `step(world, dt)` runs every system once per tick boundary crossed, so the result doesn't depend on how time is sliced (frame rate, fast-forward). The world carries two RNG streams: `game` for gameplay and `ids` for GUIDs | Replays, saves and headless mission tests give identical worlds. Issuing an extra command never shifts gameplay randomness |
| T-4 | 2026-10-08 | World save schema stays at **v1 until the first playable release (M3)**. Until then, shape changes need no migration: an old dev save simply fails to load as `not-a-world`. From M3 on, every breaking change bumps `WORLD_SCHEMA_VERSION` and adds a migration in `src/engine/save.ts` | Avoids writing migrations for saves nobody has yet, while the loader, version check and migration hook already exist |
| T-3 | 2026-10-08 | One CI workflow: verify on every push/PR, deploy `main` to Pages | One place to read, and deploy only ever ships verified builds |
| T-2 | 2026-10-08 | Engine boundary enforced by a test: no UI imports, no wall-clock time, no unseeded randomness in `src/engine` | Determinism and headless testability are the foundation of causal simulation |
| T-1 | 2026-10-08 | Vite 8, React 19, TypeScript 6.0 (not 7: typescript-eslint supports `<6.1.0`), Vitest 5, ESLint 10. Zustand, XYFlow and Playwright are added when their step needs them | Current stable versions, with nothing installed before it's used |
