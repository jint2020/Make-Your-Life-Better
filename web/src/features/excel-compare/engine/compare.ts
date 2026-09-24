import { displayValue } from './format'
import { buildKey, normalizeValue } from './normalize'
import {
  TAG_DIFF,
  TAG_EQUAL,
  TAG_MISSING,
  type CellValue,
  type CompareConfig,
  type CompareResult,
  type CompareSummary,
  type ExcludedRow,
  type FieldMapping,
  type ParsedTable,
} from './types'

export class CompareConfigError extends Error {}

/** 字段映射 → 每个文件里的列号（-1 表示该文件没有这个字段） */
function resolveColumns(tables: ParsedTable[], field: FieldMapping): number[] {
  return tables.map((t, f) => {
    const name = field.columns[f]
    return name == null ? -1 : t.headers.indexOf(name)
  })
}

function col(table: ParsedTable, c: number): CellValue[] | undefined {
  return c < 0 ? undefined : table.columns[c]
}

/**
 * 按主键匹配 2～3 个表格，逐字段比较。
 *
 * - 主键为空的行：排除，记入 excluded
 * - 主键在任一文件里重复：这个主键在所有文件里的行都排除（没法确定该和哪一行比）
 * - 结果行顺序：先按第一个文件的顺序，再补上只在后面文件里出现的
 */
export function compareTables(tables: ParsedTable[], config: CompareConfig): CompareResult {
  const start = performance.now()
  const fileCount = tables.length
  if (fileCount < 2 || fileCount > 3) throw new CompareConfigError('需要 2～3 个文件')
  if (config.keyFields.length === 0) throw new CompareConfigError('至少选择一个主键字段')

  const opts = config.normalize
  const keyCols = config.keyFields.map((k) => resolveColumns(tables, k))
  keyCols.forEach((cols, i) => {
    if (cols.some((c) => c < 0)) {
      throw new CompareConfigError(`主键字段「${config.keyFields[i]?.label}」没有映射到所有文件`)
    }
  })

  // 1. 每个文件：计算主键，找出空主键和重复主键
  const excluded: ExcludedRow[] = []
  const keysPerFile: (string | null)[][] = []
  const indexPerFile: Map<string, number[]>[] = []
  const keyText = (t: ParsedTable, r: number) =>
    keyCols.map((cols) => displayValue(col(t, cols[tables.indexOf(t)]!)?.[r]) ?? '').join(' / ')

  tables.forEach((t, f) => {
    const parts = keyCols.map((cols) => col(t, cols[f]!)!)
    const keys: (string | null)[] = new Array(t.rowCount)
    const index = new Map<string, number[]>()
    for (let r = 0; r < t.rowCount; r++) {
      const k = buildKey(
        parts.map((p) => p[r]),
        opts,
      )
      keys[r] = k
      if (k == null) {
        excluded.push({ fileIndex: f, rowNumber: t.rowNumbers[r] ?? r + 1, keyText: keyText(t, r), reason: 'empty-key' })
        continue
      }
      const list = index.get(k)
      if (list) list.push(r)
      else index.set(k, [r])
    }
    keysPerFile.push(keys)
    indexPerFile.push(index)
  })

  const duplicated = new Map<string, number[]>()
  indexPerFile.forEach((index, f) => {
    for (const [k, rows] of index) {
      if (rows.length > 1) {
        const files = duplicated.get(k)
        if (files) files.push(f)
        else duplicated.set(k, [f])
      }
    }
  })
  for (const [k, dupFiles] of duplicated) {
    indexPerFile.forEach((index, f) => {
      for (const r of index.get(k) ?? []) {
        const t = tables[f]!
        excluded.push({
          fileIndex: f,
          rowNumber: t.rowNumbers[r] ?? r + 1,
          keyText: keyText(t, r),
          reason: 'duplicate-key',
          duplicateIn: dupFiles,
        })
      }
    })
  }
  excluded.sort((a, b) => a.fileIndex - b.fileIndex || a.rowNumber - b.rowNumber)

  // 2. 合并主键：结果行 → 每个文件里的行号
  const order = new Map<string, number>()
  const rowOf: number[][] = tables.map(() => [])
  tables.forEach((t, f) => {
    const keys = keysPerFile[f]!
    for (let r = 0; r < t.rowCount; r++) {
      const k = keys[r]
      if (k == null || duplicated.has(k)) continue
      let idx = order.get(k)
      if (idx === undefined) {
        idx = order.size
        order.set(k, idx)
      }
      rowOf[f]![idx] = r
    }
  })
  const rowCount = order.size
  for (const rows of rowOf) {
    for (let i = 0; i < rowCount; i++) if (rows[i] === undefined) rows[i] = -1
  }

  const presence = new Uint8Array(rowCount)
  const keys: string[] = new Array(rowCount)
  for (let i = 0; i < rowCount; i++) {
    let mask = 0
    let first = -1
    for (let f = 0; f < fileCount; f++) {
      if (rowOf[f]![i]! >= 0) {
        mask |= 1 << f
        if (first < 0) first = f
      }
    }
    presence[i] = mask
    keys[i] = keyText(tables[first]!, rowOf[first]![i]!)
  }

  // 3. 逐字段比较
  const fieldCols = config.compareFields.map((fm) => resolveColumns(tables, fm))
  const diff = config.compareFields.map(() => new Uint8Array(rowCount))
  const values = tables.map(() => config.compareFields.map(() => new Array<string | null>(rowCount)))
  const norm: string[] = new Array(fileCount)

  fieldCols.forEach((cols, k) => {
    const d = diff[k]!
    const srcCols = tables.map((t, f) => col(t, cols[f]!))
    for (let i = 0; i < rowCount; i++) {
      let n = 0
      for (let f = 0; f < fileCount; f++) {
        const r = rowOf[f]![i]!
        const src = srcCols[f]
        const raw = r >= 0 && src ? src[r] : undefined
        values[f]![k]![i] = r >= 0 ? displayValue(raw) : null
        if (r >= 0 && src) norm[n++] = normalizeValue(raw, opts)
      }
      for (let j = 1; j < n; j++) {
        if (norm[j] !== norm[0]) {
          d[i] = 1
          break
        }
      }
    }
  })

  // 4. 附带展示列
  const displayCols = config.displayFields.map((fm) => resolveColumns(tables, fm))
  const displayValues = displayCols.map((cols) => {
    const out = new Array<string | null>(rowCount)
    for (let i = 0; i < rowCount; i++) {
      let v: string | null = null
      for (let f = 0; f < fileCount && v == null; f++) {
        const r = rowOf[f]![i]!
        if (r >= 0) v = displayValue(col(tables[f]!, cols[f]!)?.[r])
      }
      out[i] = v
    }
    return out
  })

  // 5. 标签与汇总
  const allPresent = (1 << fileCount) - 1
  const tags = new Uint8Array(rowCount)
  const summary: CompareSummary = {
    total: rowCount,
    equal: 0,
    diff: 0,
    missing: 0,
    duplicateKey: excluded.filter((e) => e.reason === 'duplicate-key').length,
    emptyKey: excluded.filter((e) => e.reason === 'empty-key').length,
  }
  for (let i = 0; i < rowCount; i++) {
    let t = 0
    if (diff.some((d) => d[i] === 1)) {
      t |= TAG_DIFF
      summary.diff++
    }
    if (presence[i] !== allPresent) {
      t |= TAG_MISSING
      summary.missing++
    }
    if (t === 0) {
      t = TAG_EQUAL
      summary.equal++
    }
    tags[i] = t
  }

  return {
    files: tables.map((t) => ({ fileId: t.fileId, fileName: t.fileName })),
    keyLabel: config.keyFields.map((k) => k.label).join(' + '),
    fieldLabels: config.compareFields.map((f) => f.label),
    displayLabels: config.displayFields.map((f) => f.label),
    displayValues,
    excluded,
    keys,
    tags,
    presence,
    values,
    diff,
    summary,
    elapsedMs: performance.now() - start,
  }
}
