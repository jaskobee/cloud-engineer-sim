import { azure, createRegistry, SYSTEMS, type Registry, type System, type World } from '../engine/index.ts'
import { missionCommands, systemsFor } from './engine.ts'
import { PIXELFORGE_LAUNCH_DAY } from './pixelforge-launch-day.ts'
import type { MissionDef } from './types.ts'

export * from './types.ts'
export * from './engine.ts'
export * from './checks.ts'
export * from './info.ts'
export { PIXELFORGE_LAUNCH_DAY, OFFICE_IP } from './pixelforge-launch-day.ts'

/** Every mission the game ships, by ID. */
export const MISSIONS: Readonly<Record<string, MissionDef>> = {
  [PIXELFORGE_LAUNCH_DAY.id]: PIXELFORGE_LAUNCH_DAY,
}

/** Azure commands (sim controls are always included) and, for a mission, its commands. */
export const registryFor = (def: MissionDef | undefined): Registry =>
  createRegistry([...azure.AZURE_COMMANDS, ...(def ? missionCommands(def) : [])])

export interface Runtime {
  mission: MissionDef | undefined
  registry: Registry
  systems: readonly System[]
}

const runtimes = new Map<string, Runtime>()

/** What a world runs with: the default registry and systems, plus its mission's when it has one. */
export function runtimeFor(world: World): Runtime {
  const id = world.mission?.id ?? ''
  const cached = runtimes.get(id)
  if (cached) return cached
  const mission = MISSIONS[id]
  const registry = registryFor(mission)
  const runtime = { mission, registry, systems: mission ? systemsFor(mission, registry) : SYSTEMS }
  runtimes.set(id, runtime)
  return runtime
}
