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
src/engine/azure/  one module per Azure resource type (schema, validation, runtime, INFO)   [from step 4]
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

## Store and UI (step 3)

`src/store/gameStore.ts`: Zustand (vanilla) store `{ world, session, lastRefusal }`. The UI changes the world
only through `store.dispatch(command)` (caller defaults to the player) and time through `tick(realMs)`.
`tickLoop.ts` drives it from animation frames (fake scheduler in tests), `persistence.ts` is the guarded
localStorage save slot (T-6). Components read with `useGame(selector)` and select the smallest value they need.
The bottom panel lists only tools that work.

## Working discipline

- Small, reviewable steps (see `Docs/BOOTSTRAP_REPORT.md` §I). Finish each with `npm run check`.
- Test the engine more than the UI. Every Azure rule has a test that asserts its rule ID.
- Write the `visual-infrastructure` skill (`.claude/skills/`) before building the canvas (step 7).
