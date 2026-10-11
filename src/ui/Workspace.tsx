import { useContext, useEffect } from 'react'
import { browserScheduler, startTickLoop } from '../store/tickLoop.ts'
import { browserStorage, readProfile, writeProfile, writeSave } from '../store/persistence.ts'
import { GameStoreContext } from './gameContext.ts'
import { Shell } from './portal/Shell.tsx'
import { InfoDialog } from './Info.tsx'
import { missionResult, MISSIONS, recordRun, runIdOf } from '../missions/index.ts'

/** The player's desk: the portal shell (D-7) plus the tick loop, autosave and career recording. */
export function Workspace() {
  const store = useContext(GameStoreContext)

  useEffect(() => {
    if (!store) return
    const storage = browserStorage()
    const save = () => void writeSave(storage, store.getState().world)
    const stop = startTickLoop(store, browserScheduler, { onAutosave: save })
    // Count a finished mission in the career profile once (step 11).
    const record = () => {
      const world = store.getState().world
      const def = world.mission ? MISSIONS[world.mission.id] : undefined
      const runId = runIdOf(world)
      if (!def || !runId || world.mission?.completedAt === undefined) return
      const profile = readProfile(storage)
      if (profile.runs[runId]) return
      const result = missionResult(def, world)
      if (result) writeProfile(storage, recordRun(profile, runId, { missionId: def.id, mode: world.mission.mode, xp: result.xp.total, badges: result.badges }))
    }
    record()
    const unsubscribe = store.subscribe((state, prev) => {
      if (state.world.mission?.completedAt !== prev.world.mission?.completedAt) record()
    })
    const onHide = () => {
      if (document.visibilityState === 'hidden') save()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', save)
    return () => {
      unsubscribe()
      stop()
      save()
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', save)
    }
  }, [store])

  return (
    <>
      <Shell />
      <InfoDialog />
    </>
  )
}
