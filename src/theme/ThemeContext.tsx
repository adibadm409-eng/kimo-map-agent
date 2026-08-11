import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { Appearance } from 'react-native'
import { lightTheme, darkTheme, type ThemeColors, type ThemeMode } from './tokens'

interface ThemeContextType {
  mode: ThemeMode
  colors: ThemeColors
  toggle: () => void
  setMode: (m: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setModeState(colorScheme === 'dark' ? 'dark' : 'light')
    })
    return () => sub.remove()
  }, [])

  function setMode(m: ThemeMode) {
    setModeState(m)
  }

  function toggle() {
    setModeState((prev) => (prev === 'light' ? 'dark' : 'light'))
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
