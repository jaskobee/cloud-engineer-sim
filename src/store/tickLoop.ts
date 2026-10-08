import type { GameStore } from './gameStore.ts'

/** requestAnimationFrame in the browser; a fake in tests. */
export interface FrameScheduler {
  request(callback: (time: number) => void): number
  cancel(handle: number): void
}

export interface TickLoopOptions {
  /** Real ms to accumulate before committing to the store. Keeps re-renders to ~10 per second. */
  commitEveryMs?: number
  /**
   * Longest real gap counted per frame. When the tab is hidden the browser stops frames; on return
   * the simulation resumes instead of jumping ahead. The sim runs only while the game is open (MVP §19).
   */
  maxFrameMs?: number
  autosaveEveryMs?: number
  onAutosave?: () => void
}

export const browserScheduler: FrameScheduler = {
  request: cb => requestAnimationFrame(cb),
  cancel: handle => cancelAnimationFrame(handle),
}

/**
 * Drives the simulation from animation frames. Because `step` is independent of how time is sliced
 * (T-5), committing in batches gives exactly the same world as committing every frame.
 * Returns a stop function.
 */
export function startTickLoop(store: GameStore, scheduler: FrameScheduler, options: TickLoopOptions = {}): () => void {
  const { commitEveryMs = 100, maxFrameMs = 250, autosaveEveryMs = 15_000, onAutosave } = options
  let last: number | null = null
  let pending = 0
  let sinceSave = 0
  let handle: number | null = null

  const frame = (time: number) => {
    if (last !== null) {
      const elapsed = Math.min(Math.max(time - last, 0), maxFrameMs)
      pending += elapsed
      sinceSave += elapsed
      if (pending >= commitEveryMs) {
        store.getState().tick(pending)
        pending = 0
      }
      if (onAutosave && sinceSave >= autosaveEveryMs) {
        onAutosave()
        sinceSave = 0
      }
    }
    last = time
    handle = scheduler.request(frame)
  }

  handle = scheduler.request(frame)
  return () => {
    if (handle !== null) scheduler.cancel(handle)
    handle = null
  }
}
