import { createContext, use } from 'react'

import type { ThemeMode, ThemeSettings } from './constants'

export interface ThemeContextValue extends ThemeSettings {
  resolvedMode: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
  setPresetId: (id: string) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = use(ThemeContext)
  if (!ctx) throw new Error('useTheme 必须在 <ThemeProvider> 内使用')
  return ctx
}
