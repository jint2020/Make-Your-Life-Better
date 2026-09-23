import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { readLocal, writeLocal, writeLocalRaw } from '@/shared/storage/local'
import {
  THEME_CSS_KEY,
  THEME_SETTINGS_KEY,
  THEME_STYLE_ID,
  type ThemeMode,
  type ThemeSettings,
} from './constants'
import { themeToCss } from './parseThemeCss'
import { DEFAULT_PRESET_ID, findPreset } from './presets'
import { ThemeContext } from './useTheme'

const DEFAULT_SETTINGS: ThemeSettings = { mode: 'system', presetId: DEFAULT_PRESET_ID }

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyPreset(presetId: string): void {
  const root = document.documentElement
  const preset = findPreset(presetId)
  let style = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null

  if (!preset.theme) {
    root.removeAttribute('data-theme-preset')
    style?.remove()
    writeLocalRaw(THEME_CSS_KEY, null)
    return
  }

  const css = themeToCss(preset.theme)
  if (!style) {
    style = document.createElement('style')
    style.id = THEME_STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = css
  root.setAttribute('data-theme-preset', preset.id)
  // 缓存生成好的 CSS，下次打开页面时首屏脚本直接注入，避免闪烁
  writeLocalRaw(THEME_CSS_KEY, css)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...readLocal<Partial<ThemeSettings>>(THEME_SETTINGS_KEY, {}),
  }))
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const resolvedMode: 'light' | 'dark' =
    settings.mode === 'system' ? (systemDark ? 'dark' : 'light') : settings.mode

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedMode === 'dark')
  }, [resolvedMode])

  useEffect(() => {
    applyPreset(settings.presetId)
  }, [settings.presetId])

  useEffect(() => {
    writeLocal(THEME_SETTINGS_KEY, settings)
  }, [settings])

  const setMode = useCallback((mode: ThemeMode) => setSettings((s) => ({ ...s, mode })), [])
  const setPresetId = useCallback(
    (presetId: string) => setSettings((s) => ({ ...s, presetId })),
    [],
  )

  const value = useMemo(
    () => ({ ...settings, resolvedMode, setMode, setPresetId }),
    [settings, resolvedMode, setMode, setPresetId],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}
