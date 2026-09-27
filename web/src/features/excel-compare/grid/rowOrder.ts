import { cellValue, TAG_DIFF, TAG_EQUAL, TAG_MISSING, type CompareResult } from '../engine/types'

/**
 * 结果表的行顺序：筛选、搜索、排序都在这里算，结果是一串行号（Int32Array）。
 * 表格用 AG Grid 的"无限滚动"行模型，只给看得见的那一段行建节点；
 * 10 万行时筛选、排序也只是在整数数组上操作，不会像交给 AG Grid 那样为每行建对象而卡住页面。
 */

export type TagFilter = 'all' | 'diff' | 'missing' | 'equal'

export interface SortItem {
  colId: string
  sort: 'asc' | 'desc'
}

const TAG_MASK: Record<Exclude<TagFilter, 'all'>, number> = {
  diff: TAG_DIFF,
  missing: TAG_MISSING,
  equal: TAG_EQUAL,
}

/** 按标签和主键搜索筛选，保持原来的顺序 */
export function filterRows(result: CompareResult, tagFilter: TagFilter, keySearch: string): Int32Array {
  const q = keySearch.trim()
  const mask = tagFilter === 'all' ? 0 : TAG_MASK[tagFilter]
  const total = result.keys.length
  const out = new Int32Array(total)
  let n = 0
  for (let i = 0; i < total; i++) {
    if (mask !== 0 && ((result.tags[i] ?? 0) & mask) === 0) continue
    if (q && !(result.keys[i]?.includes(q) ?? false)) continue
    out[n++] = i
  }
  return out.slice(0, n)
}

/** 列 id → 取这一列排序用的值（和表格里显示的文本一致） */
function sortValueGetter(result: CompareResult, colId: string): ((i: number) => string | null) | null {
  if (colId === 'key') return (i) => result.keys[i] ?? null
  const display = /^display_(\d+)$/.exec(colId)
  if (display) {
    const k = Number(display[1])
    return (i) => result.displayValues[k]?.[i] ?? null
  }
  const value = /^v_(\d+)_(\d+)$/.exec(colId)
  if (value) {
    const f = Number(value[1])
    const k = Number(value[2])
    // 这一行不在这个文件里：当成空值
    return (i) => ((((result.presence[i] ?? 0) >> f) & 1) === 1 ? cellValue(result, f, k, i) : null)
  }
  return null
}

/** 和 AG Grid 默认的比较一样：空值排在最前，文本按字符比较 */
function compareValues(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a == null) return -1
  if (b == null) return 1
  return a < b ? -1 : 1
}

/** 按排序设置（可以多列）重排行号；排序值相同的保持原来的顺序 */
export function sortRows(result: CompareResult, rows: Int32Array, sortModel: readonly SortItem[]): Int32Array {
  const keys = sortModel
    .map((s) => ({ get: sortValueGetter(result, s.colId), dir: s.sort === 'desc' ? -1 : 1 }))
    .filter((s): s is { get: (i: number) => string | null; dir: number } => s.get != null)
  if (keys.length === 0) return rows

  // 先把排序值取出来，比较时就不用反复解码
  const columns = keys.map((s) => Array.from(rows, (i) => s.get(i)))
  const positions = Array.from(rows, (_, pos) => pos)
  positions.sort((p, q) => {
    for (let c = 0; c < keys.length; c++) {
      const cmp = compareValues(columns[c]![p]!, columns[c]![q]!)
      if (cmp !== 0) return cmp * keys[c]!.dir
    }
    return p - q
  })
  return Int32Array.from(positions, (pos) => rows[pos]!)
}
