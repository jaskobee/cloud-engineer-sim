import { createContext, useContext } from 'react'
import type { ThemeChoice } from '../../store/persistence.ts'

/** The player's theme choice and its setter (PortalTheme provides it). */
export const ThemeChoiceContext = createContext<[ThemeChoice, (c: ThemeChoice) => void]>(['system', () => {}])

export const useThemeChoice = () => useContext(ThemeChoiceContext)
