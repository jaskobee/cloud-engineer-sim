import { createContext, useContext } from 'react'
import { useStore } from 'zustand'
import type { GameState, GameStore } from '../store/gameStore.ts'

export const GameStoreContext = createContext<GameStore | null>(null)

/** Read from the game store. Select the smallest value you need, so a component re-renders only when it changes. */
export function useGame<T>(selector: (state: GameState) => T): T {
  const store = useContext(GameStoreContext)
  if (!store) throw new Error('useGame must be used inside <GameStoreContext.Provider>')
  return useStore(store, selector)
}
