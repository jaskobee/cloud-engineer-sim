import { creatorOf, type ArmId, type World } from '../../engine/index.ts'
import { PLAYER_PRINCIPAL } from '../../store/gameStore.ts'

/** A caller (MON-9) as a person: you, a client contact by name, or the raw principal. */
export function callerLabel(caller: string | null, world: Pick<World, 'external'>): string {
  if (caller === null) return 'Not in the activity log'
  if (caller === PLAYER_PRINCIPAL) return 'You'
  return world.external.actors.find(a => a.principalName === caller)?.displayName ?? caller
}

/** **Created by** (PORTAL-21s): a simulator field, derived from the activity log. */
export const createdByLabel = (id: ArmId, world: Pick<World, 'external' | 'activityLog'>): string => callerLabel(creatorOf(world.activityLog, id), world)

/** True when the player made it (or nobody knows): what the build plan doesn't list as "already there". */
export const createdByPlayer = (id: ArmId, world: Pick<World, 'activityLog'>): boolean => creatorOf(world.activityLog, id) === PLAYER_PRINCIPAL
