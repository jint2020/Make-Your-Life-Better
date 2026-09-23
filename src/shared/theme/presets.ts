import amberCss from './presets/amber.css?raw'
import oceanCss from './presets/ocean.css?raw'
import violetCss from './presets/violet.css?raw'
import { parseThemeCss, type ParsedTheme } from './parseThemeCss'

export interface ThemePreset {
  id: string
  name: string
  /** 菜单里的色块预览 */
  swatch: string
  /** null 表示直接使用 index.css 里的默认主题 */
  theme: ParsedTheme | null
}

/**
 * 新增主题：
 * 1. 在 tweakcn.com 调好主题，复制 Code 面板里的 CSS
 * 2. 存成 presets/<id>.css
 * 3. 在下面登记一行
 */
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'default', name: '素雅灰', swatch: 'oklch(0.205 0 0)', theme: null },
  { id: 'ocean', name: '海湾蓝', swatch: 'oklch(0.55 0.17 250)', theme: parseThemeCss(oceanCss) },
  { id: 'amber', name: '暖阳', swatch: 'oklch(0.64 0.16 55)', theme: parseThemeCss(amberCss) },
  { id: 'violet', name: '暮紫', swatch: 'oklch(0.54 0.2 290)', theme: parseThemeCss(violetCss) },
]

export const DEFAULT_PRESET_ID = 'default'

export function findPreset(id: string): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0]!
}
