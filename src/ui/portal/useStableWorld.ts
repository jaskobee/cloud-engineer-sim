import { useContext } from 'react'
import type { World } from '../../engine/index.ts'
import { GameStoreContext, useGame } from '../gameContext.ts'

/**
 * The current world, re-rendering only when something a page shows changes (resources, runtime, deployments,
 * alerts, telemetry, the activity log, the mission) and not on every clock tick. Pages that show the clock
 * itself subscribe to it separately.
 */
export function useStableWorld(): World {
  useGame(s => s.world.tenant)
  useGame(s => s.world.runtime)
  useGame(s => s.world.deployments)
  useGame(s => s.world.alerts)
  useGame(s => s.world.telemetry)
  useGame(s => s.world.activityLog)
  useGame(s => s.world.mission)
  useGame(s => s.world.external)
  const store = useContext(GameStoreContext)
  if (!store) throw new Error('useStableWorld must be used inside <GameStoreContext.Provider>')
  return store.getState().world
}
