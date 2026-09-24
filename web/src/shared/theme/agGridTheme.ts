import { themeQuartz } from 'ag-grid-community'

/**
 * AG Grid 主题桥：所有颜色都直接引用 shadcn / tweakcn 的 CSS 变量。
 * 切换主题预设或深浅色时，表格会跟着变，不需要重新创建 theme 对象。
 */
export const agGridTheme = themeQuartz.withParams({
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  backgroundColor: 'var(--background)',
  foregroundColor: 'var(--foreground)',
  textColor: 'var(--foreground)',
  subtleTextColor: 'var(--muted-foreground)',
  accentColor: 'var(--primary)',
  borderColor: 'var(--border)',
  chromeBackgroundColor: 'var(--muted)',
  headerBackgroundColor: 'var(--muted)',
  headerTextColor: 'var(--foreground)',
  headerFontWeight: 600,
  rowHoverColor: 'color-mix(in oklch, var(--accent) 70%, transparent)',
  selectedRowBackgroundColor: 'color-mix(in oklch, var(--primary) 12%, transparent)',
  oddRowBackgroundColor: 'color-mix(in oklch, var(--muted) 35%, transparent)',
  wrapperBorderRadius: 'var(--radius)',
  borderRadius: 'calc(var(--radius) - 4px)',
  spacing: 6,
  rowHeight: 34,
  headerHeight: 36,
})
