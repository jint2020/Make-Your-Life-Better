import type { CompareConfig, FieldMapping, NormalizeOptions } from '../engine/types'

export type FieldRole = 'key' | 'compare' | 'display' | 'ignore'

/** 字段映射表的一行：一个逻辑字段在各文件里对应的列，以及它的用途 */
export interface FieldRow {
  id: string
  label: string
  role: FieldRole
  columns: (string | null)[]
}

const KEY_HINT = /工号|员工编号|人员编号|编号|编码|身份证|证件号|学号|账号|^id$|code/i

/**
 * 根据各文件表头生成字段映射：
 * - 以第一个文件的列为主，同名列自动配对
 * - 后面文件里没配上的列追加成新行
 * - 默认用途：猜一个主键；在 2 个以上文件出现的列设为"对比"；其余"忽略"
 */
export function buildFieldRows(headersPerFile: string[][]): FieldRow[] {
  const rows: FieldRow[] = []
  const used = headersPerFile.map(() => new Set<string>())

  headersPerFile.forEach((headers, f) => {
    for (const h of headers) {
      if (used[f]!.has(h)) continue
      const columns = headersPerFile.map((other, g) => {
        if (g < f) return null
        if (g === f) return h
        return other.includes(h) && !used[g]!.has(h) ? h : null
      })
      columns.forEach((c, g) => c && used[g]!.add(c))
      rows.push({ id: `${f}:${h}`, label: h, role: 'ignore', columns })
    }
  })

  const fileCount = headersPerFile.length
  mergeKeyCandidates(rows, fileCount)
  const keyRow = rows.find((r) => KEY_HINT.test(r.label) && r.columns.every((c) => c != null))
  for (const r of rows) {
    const mapped = r.columns.filter((c) => c != null).length
    r.role = r === keyRow ? 'key' : mapped >= Math.min(2, fileCount) ? 'compare' : 'ignore'
  }
  return rows
}

/**
 * 主键列在不同文件里经常叫不同的名字（"工号" / "员工编号"）。
 * 对第一个像主键的字段：如果某个文件里它没配上，而那个文件恰好只有一列"像主键"且没被配对，就自动配上。
 */
function mergeKeyCandidates(rows: FieldRow[], fileCount: number): void {
  const key = rows.find((r) => KEY_HINT.test(r.label) && r.columns[0] != null)
  if (!key) return
  for (let g = 1; g < fileCount; g++) {
    if (key.columns[g] != null) continue
    const candidates = rows.filter(
      (r) => r !== key && KEY_HINT.test(r.label) && r.columns.every((c, i) => (i === g ? c != null : c == null)),
    )
    if (candidates.length !== 1) continue
    const only = candidates[0]!
    key.columns[g] = only.columns[g]!
    rows.splice(rows.indexOf(only), 1)
  }
}

/** 字段映射对应的"表头签名"：表头没变时保留用户已经调好的映射 */
export function headersSignature(headersPerFile: string[][]): string {
  return JSON.stringify(headersPerFile)
}

export interface FieldValidation {
  errors: string[]
  hints: string[]
}

export function validateFieldRows(rows: FieldRow[]): FieldValidation {
  const errors: string[] = []
  const hints: string[] = []
  const keys = rows.filter((r) => r.role === 'key')
  if (keys.length === 0) errors.push('请至少选择一个主键字段。')
  for (const k of keys) {
    if (k.columns.some((c) => c == null)) errors.push(`主键「${k.label}」需要在每个文件里都选择对应的列。`)
  }
  const compares = rows.filter((r) => r.role === 'compare')
  if (keys.length > 0 && compares.length === 0) hints.push('没有选择对比字段：只会比较各文件里有哪些主键、缺了哪些。')
  for (const c of compares) {
    if (c.columns.filter((x) => x != null).length < 2) {
      errors.push(`对比字段「${c.label}」至少要在两个文件里有对应的列。`)
    }
  }
  return { errors, hints }
}

function toMapping(r: FieldRow): FieldMapping {
  return { id: r.id, label: r.label, columns: r.columns }
}

export function toCompareConfig(fileIds: string[], rows: FieldRow[], normalize: NormalizeOptions): CompareConfig {
  return {
    fileIds,
    keyFields: rows.filter((r) => r.role === 'key').map(toMapping),
    compareFields: rows.filter((r) => r.role === 'compare').map(toMapping),
    displayFields: rows.filter((r) => r.role === 'display').map(toMapping),
    normalize,
  }
}

/** 批量设置能用的用途：不包括主键（主键只能逐行设） */
export type BulkRole = Exclude<FieldRole, 'key'>

export interface BulkResult {
  rows: FieldRow[]
  /** 设置成目标用途的字段数 */
  applied: number
  /** 保持不动的主键字段数 */
  keptKeys: number
  /** 设为"对比"时，因为只在一个文件里出现而跳过的字段数 */
  skippedSingle: number
}

/**
 * 把所有非主键字段设成同一个用途。
 * - 主键行不改
 * - 设为"对比"时，只在一个文件里出现的字段没法比，保持原来的用途
 */
export function applyBulkRole(rows: FieldRow[], role: BulkRole): BulkResult {
  let applied = 0
  let keptKeys = 0
  let skippedSingle = 0
  const next = rows.map((r) => {
    if (r.role === 'key') {
      keptKeys++
      return r
    }
    if (role === 'compare' && r.columns.filter((c) => c != null).length < 2) {
      skippedSingle++
      return r
    }
    applied++
    return r.role === role ? r : { ...r, role }
  })
  return { rows: next, applied, keptKeys, skippedSingle }
}
