import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { FluentProvider, webDarkTheme, webLightTheme } from '@fluentui/react-components'
import { browserStorage, readTheme, writeTheme, type ThemeChoice } from '../../store/persistence.ts'
import { useMediaQuery } from '../useMediaQuery.ts'
import { ThemeChoiceContext } from './themeContext.ts'

/**
 * Fluent 2 light and dark themes (the portal's design language). Follows the operating system unless the
 * player picks one in Settings. The choice is a per-browser convenience in its own storage key.
 */
export function PortalTheme({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readTheme(browserStorage()))
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const dark = choice === 'dark' || (choice === 'system' && systemDark)
  const theme = dark ? webDarkTheme : webLightTheme

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c)
    writeTheme(browserStorage(), c)
  }, [])

  // The page behind the app (overscroll, native dialogs' backdrop) and form controls follow the theme too.
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.body.style.background = theme.colorNeutralBackground2
  }, [dark, theme])

  const value = useMemo<[ThemeChoice, (c: ThemeChoice) => void]>(() => [choice, setChoice], [choice, setChoice])
  return (
    <ThemeChoiceContext.Provider value={value}>
      <FluentProvider theme={theme} className="portal-root">{children}</FluentProvider>
    </ThemeChoiceContext.Provider>
  )
}
