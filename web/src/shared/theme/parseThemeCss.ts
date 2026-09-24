/**
 * 解析 tweakcn 导出的主题 CSS，只提取 :root 和 .dark 里允许覆盖的变量。
 *
 * 语义色（--diff-*）不在白名单里：用户主题永远改不了差异高亮的颜色。
 */

export type ThemeVars = Record<string, string>

export interface ParsedTheme {
  light: ThemeVars
  dark: ThemeVars
}

/** 允许主题预设覆盖的变量（shadcn / tweakcn 标准变量） */
export const THEMEABLE_VARS = new Set([
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'radius',
  'font-sans',
  'font-serif',
  'font-mono',
  'shadow-color',
  'letter-spacing',
  'spacing',
])

const BLOCK_RE = /(:root|\.dark)\s*\{([^}]*)\}/g
const DECL_RE = /--([a-z0-9-]+)\s*:\s*([^;]+);?/gi

function parseDecls(body: string): ThemeVars {
  const vars: ThemeVars = {}
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of clean.matchAll(DECL_RE)) {
    const name = m[1]?.toLowerCase()
    const value = m[2]?.trim()
    if (name && value && THEMEABLE_VARS.has(name)) vars[name] = value
  }
  return vars
}

export function parseThemeCss(css: string): ParsedTheme {
  const out: ParsedTheme = { light: {}, dark: {} }
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of clean.matchAll(BLOCK_RE)) {
    const target = m[1] === ':root' ? out.light : out.dark
    Object.assign(target, parseDecls(m[2] ?? ''))
  }
  return out
}

function declBlock(vars: ThemeVars): string {
  return Object.entries(vars)
    .map(([k, v]) => `--${k}:${v};`)
    .join('')
}

/**
 * 生成注入用的 CSS。选择器带 [data-theme-preset]，优先级高于 index.css 里的默认值。
 */
export function themeToCss(theme: ParsedTheme): string {
  return (
    `:root[data-theme-preset]{${declBlock(theme.light)}}` +
    `:root[data-theme-preset].dark{${declBlock(theme.dark)}}`
  )
}
