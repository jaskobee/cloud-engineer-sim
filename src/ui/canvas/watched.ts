import { useContext, useMemo } from 'react'
import { MISSIONS } from '../../missions/index.ts'
import { watchedFlowId, type WatchedFlow } from '../../store/gameStore.ts'
import { GameStoreContext, useGame } from '../gameContext.ts'

/**
 * Every watched flow (visual-infrastructure skill, D-5): the ones the mission declares the client depends
 * on, found by role in the current world, then the ones the player pinned from IP flow verify. Recomputed
 * when the tenant, the external world (apps) or the pins change, never on clock ticks.
 */
export function useWatchedFlows(): WatchedFlow[] {
  const pinned = useGame(s => s.session.ui.canvas.watched)
  const tenant = useGame(s => s.world.tenant)
  const external = useGame(s => s.world.external)
  const missionId = useGame(s => s.world.mission?.id ?? null)
  const store = useContext(GameStoreContext)
  return useMemo(() => {
    const def = missionId ? MISSIONS[missionId] : undefined
    const declared = store && def?.watchedFlows ? def.watchedFlows(store.getState().world) : []
    const mission: WatchedFlow[] = declared.map(f => ({ ...f, id: watchedFlowId(f), fromMission: true }))
    const ids = new Set(mission.map(f => f.id))
    return [...mission, ...pinned.filter(p => !ids.has(p.id))]
    // tenant and external are what the mission's flows are found from.
  }, [pinned, tenant, external, missionId, store])
}
