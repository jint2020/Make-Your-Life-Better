import { t } from '../copy'
import { TAG_DIFF, TAG_EQUAL, type CompareResult } from '../engine/types'
import { fileLetter, type ColumnLayout } from '../grid/shared'
import { columnLetter } from '../parse/headers'
import { XLSX_STYLE, type XlsxCell, type XlsxSheet } from './xlsxWriter'

/** 导出请求：导出范围跟随页面当前的筛选、排序和列设置 */
export interface ExportRequest {
  /** 要导出的结果行（结果里的行下标），按页面上显示的顺序 */
  rows: Int32Array
  layout: ColumnLayout
  onlyDiffColumns: boolean
}

const MISSING = '—'

/** 一个值列：文件 f 的字段 k */
interface ValueColumn {
  f: number
  k: number
  group: string
  header: string
}

const fileTitle = (result: CompareResult, f: number) => `${fileLetter(f)} · ${result.files[f]?.fileName ?? ''}`
const hasField = (result: CompareResult, f: number, k: number) => (((result.fieldFiles[k] ?? 0) >> f) & 1) === 1
const isPresent = (result: CompareResult, f: number, i: number) => (((result.presence[i] ?? 0) >> f) & 1) === 1
const isOdd = (result: CompareResult, f: number, k: number, i: number) => (((result.diff[k]?.[i] ?? 0) >> f) & 1) === 1

/** 和页面状态列一样：全部一致 / 差异字段 / 缺 X */
export function statusText(result: CompareResult, i: number): string {
  const tag = result.tags[i] ?? 0
  const parts: string[] = []
  if (tag & TAG_EQUAL) parts.push(t.result.summary.equal)
  if (tag & TAG_DIFF) {
    parts.push(t.result.diffFields(result.fieldLabels.filter((_, k) => (result.diff[k]?.[i] ?? 0) !== 0)))
  }
  result.files.forEach((_, f) => {
    if (!isPresent(result, f, i)) parts.push(t.result.missingIn(fileLetter(f)))
  })
  return parts.join(t.export.statusSeparator)
}

/** 一个格子：文件里没有这一行 → 灰色"—"；这个文件的值和别人不一样 → 标黄 */
function valueCell(result: CompareResult, f: number, k: number, i: number): XlsxCell {
  if (!isPresent(result, f, i)) return { v: MISSING, s: XLSX_STYLE.missing }
  const v = result.values[f]?.[k]?.[i] ?? ''
  return isOdd(result, f, k, i) ? { v, s: XLSX_STYLE.diff } : v
}

function valueColumns(result: CompareResult, req: ExportRequest): ValueColumn[] {
  const visible = result.fieldLabels.map(
    (_, k) => !req.onlyDiffColumns || (result.diff[k]?.some((m) => m !== 0) ?? false),
  )
  const cols: ValueColumn[] = []
  if (req.layout === 'field') {
    result.fieldLabels.forEach((label, k) => {
      if (!visible[k]) return
      result.files.forEach((_, f) => {
        if (hasField(result, f, k)) cols.push({ f, k, group: label, header: fileTitle(result, f) })
      })
    })
  } else {
    result.files.forEach((_, f) => {
      result.fieldLabels.forEach((label, k) => {
        if (visible[k] && hasField(result, f, k)) cols.push({ f, k, group: fileTitle(result, f), header: label })
      })
    })
  }
  return cols
}

/** 对比结果：两行表头（分组 + 列），冻结表头和主键、状态列 */
function resultSheet(result: CompareResult, req: ExportRequest): XlsxSheet {
  const fixed = [result.keyLabel, t.export.status, ...result.displayLabels]
  const cols = valueColumns(result, req)
  const merges: string[] = []
  const letter = columnLetter

  // 固定列上下两行合并；值列按分组横向合并
  fixed.forEach((_, c) => merges.push(`${letter(c)}1:${letter(c)}2`))
  let start = 0
  for (let c = 1; c <= cols.length; c++) {
    if (c === cols.length || cols[c]!.group !== cols[start]!.group) {
      if (c - start > 1) merges.push(`${letter(fixed.length + start)}1:${letter(fixed.length + c - 1)}1`)
      start = c
    }
  }

  return {
    name: t.export.sheetResult,
    widths: [14, 18, ...result.displayLabels.map(() => 14), ...cols.map(() => (req.layout === 'field' ? 18 : 14))],
    freeze: { rows: 2, cols: 2 },
    autoFilterRow: 2,
    merges,
    rows: (emit) => {
      const header1: XlsxCell[] = fixed.map((v) => ({ v, s: XLSX_STYLE.header }))
      const header2: XlsxCell[] = fixed.map(() => ({ v: '', s: XLSX_STYLE.header }))
      cols.forEach((col, c) => {
        const groupStart = c === 0 || cols[c - 1]!.group !== col.group
        header1.push({ v: groupStart ? col.group : '', s: XLSX_STYLE.groupHeader })
        header2.push({ v: col.header, s: XLSX_STYLE.header })
      })
      emit(header1)
      emit(header2)
      for (const i of req.rows) {
        const row: XlsxCell[] = [result.keys[i] ?? '', statusText(result, i)]
        result.displayValues.forEach((vals) => row.push(vals[i] ?? ''))
        for (const col of cols) row.push(valueCell(result, col.f, col.k, i))
        emit(row)
      }
    },
  }
}

/** 差异明细：每处差异一行（主键 / 字段 / 各文件的值） */
function detailSheet(result: CompareResult, req: ExportRequest): XlsxSheet {
  return {
    name: t.export.sheetDetail,
    widths: [14, 12, ...result.files.map(() => 22)],
    freeze: { rows: 1, cols: 2 },
    autoFilterRow: 1,
    rows: (emit) => {
      emit(
        [result.keyLabel, t.export.field, ...result.files.map((_, f) => fileTitle(result, f))].map((v) => ({
          v,
          s: XLSX_STYLE.header,
        })),
      )
      for (const i of req.rows) {
        result.fieldLabels.forEach((label, k) => {
          if ((result.diff[k]?.[i] ?? 0) === 0) return
          emit([
            result.keys[i] ?? '',
            label,
            ...result.files.map((_, f) => (hasField(result, f, k) ? valueCell(result, f, k, i) : '')),
          ])
        })
      }
    },
  }
}

/** 主键重复 / 为空、没有参与对比的行 */
function excludedSheet(result: CompareResult): XlsxSheet {
  return {
    name: t.export.sheetExcluded,
    widths: [28, 10, 18, 24],
    freeze: { rows: 1, cols: 0 },
    autoFilterRow: 1,
    rows: (emit) => {
      emit([t.excluded.file, t.excluded.row, t.excluded.key, t.excluded.reason].map((v) => ({ v, s: XLSX_STYLE.header })))
      for (const e of result.excluded) {
        emit([
          fileTitle(result, e.fileIndex),
          String(e.rowNumber),
          e.keyText,
          e.reason === 'empty-key'
            ? t.excluded.emptyKey
            : t.excluded.duplicateIn((e.duplicateIn ?? [e.fileIndex]).map(fileLetter).join('、')),
        ])
      }
    },
  }
}

export function buildExportSheets(result: CompareResult, req: ExportRequest): XlsxSheet[] {
  const sheets = [resultSheet(result, req), detailSheet(result, req)]
  if (result.excluded.length > 0) sheets.push(excludedSheet(result))
  return sheets
}

/** 文件名里的时间戳：20260925-1430 */
export function exportStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}
