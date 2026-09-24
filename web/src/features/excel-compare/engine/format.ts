import type { CellValue } from './types'
import { formatDate } from './normalize'

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 单元格的展示文本（结果表、预览、导出用）。空值返回 null */
export function displayValue(v: CellValue | undefined): string | null {
  if (v == null) return null
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    const date = formatDate(v)
    const h = v.getHours()
    const m = v.getMinutes()
    const s = v.getSeconds()
    return h || m || s ? `${date} ${pad2(h)}:${pad2(m)}${s ? `:${pad2(s)}` : ''}` : date
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return String(v)
  return v === '' ? null : v
}
