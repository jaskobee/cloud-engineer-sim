/**
 * Simulation engine: headless, pure and deterministic.
 *
 * Everything the player sees (canvas, inspector, logs, metrics, missions) is a view of the
 * world this engine owns. The world changes in exactly two ways: a command (`dispatch`),
 * or time (`step` / `advance`).
 *
 * Enforced by tests/boundaries.test.ts:
 *   - no React, DOM or UI imports, and no relative imports that leave src/engine;
 *   - no wall-clock time or unseeded randomness: time comes from the sim clock,
 *     randomness from the seeded RNG streams in the world.
 *
 * Azure behaviour implemented here must cite a rule ID from Docs/AZURE_FACTS.md
 * (checked by tests/facts.test.ts).
 */

export * from './world.ts'
export * from './clock.ts'
export * from './commands.ts'
export * from './activityLog.ts'
export * from './deployments.ts'
export * from './registry.ts'
export * from './save.ts'
export { SIM_COMMANDS } from './simCommands.ts'
export * as azure from './azure/index.ts'
