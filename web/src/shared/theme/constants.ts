export type ThemeMode = 'light' | 'dark' | 'system'

export interface ThemeSettings {
  mode: ThemeMode
  presetId: string
}

/** 这两个 key 也被 index.html 里的首屏脚本读取，改名要同步 */
export const THEME_SETTINGS_KEY = 'mylb:theme'
export const THEME_CSS_KEY = 'mylb:theme-css'
export const THEME_STYLE_ID = 'mylb-theme-preset'
