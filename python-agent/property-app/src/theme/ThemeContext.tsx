import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Appearance } from 'react-native'
import { lightTheme, darkTheme, type ThemeColors, type ThemeMode } from './tokens'

interface ThemeContextType {
  mode: ThemeMode
  colors: ThemeColors
  toggle: () => void
  setMode: (m: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)
const THEME_STORAGE_KEY = 'property-manager.theme-mode'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'
  })
  const [hydrated, setHydrated] = useState(false)
  const explicitPreference = useRef(false)

  useEffect(() => {
    let active = true
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (!active) return
        if (stored === 'light' || stored === 'dark') {
          explicitPreference.current = true
          setModeState(stored)
        }
      })
      .catch((error) => console.warn('[Theme] Failed to restore theme preference:', error))
      .finally(() => {
        if (active) setHydrated(true)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      if (!explicitPreference.current) setModeState(colorScheme === 'dark' ? 'dark' : 'light')
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (!hydrated) return
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode)
      .catch((error) => console.warn('[Theme] Failed to persist theme preference:', error))
  }, [hydrated, mode])

  function setMode(m: ThemeMode) {
    explicitPreference.current = true
    setModeState(m)
  }

  function toggle() {
    setMode(mode === 'light' ? 'dark' : 'light')
  }

  const colors = mode === 'light' ? lightTheme : darkTheme

  return (
    <ThemeContext.Provider value={{ mode, colors, toggle, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
