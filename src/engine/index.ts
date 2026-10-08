/**
 * Simulation engine: headless, pure and deterministic.
 *
 * Everything the player sees (canvas, inspector, logs, metrics, missions) is a view of the
 * world this engine owns. The world changes in exactly two ways: a command, or time (`step`).
 *
 * Enforced by tests/boundaries.test.ts:
 *   - no React, DOM or UI imports, and no relative imports that leave src/engine;
 *   - no wall-clock time or unseeded randomness: time comes from the sim clock,
 *     randomness from a seeded RNG (both arrive in step 2).
 *
 * Azure behaviour implemented here must cite a rule ID from Docs/AZURE_FACTS.md.
 */

/** Version of the saved world format. Bump it (and add a migration) on any breaking change. */
export const WORLD_SCHEMA_VERSION = 1 as const
