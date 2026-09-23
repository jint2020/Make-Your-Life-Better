import Papa from 'papaparse'
import * as XLSX from 'xlsx'

import { displayValue } from '../engine/format'
import type { CellValue, ParsedTable } from '../engine/types'
import { ParseError } from './errors'
import { normalizeHeaders } from './headers'
import type { FileKind, SheetGrid, SheetInfo } from './types'

export const PREVIEW_ROWS = 20

/** 按扩展名 + 文件头判断类型 */
export function detectKind(fileName: string, bytes: Uint8Array): FileKind {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  if (ext === 'xls') throw new ParseError('unsupported-xls')
  if (ext === 'csv' || ext === 'txt') return 'csv'
  if (ext === 'xlsx' || ext === 'xlsm') {
    // xlsx 是 zip（PK..）；加密后的 xlsx 会变成 OLE 容器（D0 CF 11 E0）
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
      throw new ParseError('encrypted')
    }
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new ParseError('corrupt')
    return 'xlsx'
  }
  throw new ParseError('unsupported-type')
}

export function readWorkbook(bytes: Uint8Array): XLSX.WorkBook {
  try {
    return XLSX.read(bytes, {
      type: 'array',
      dense: true,
      cellDates: true,
      cellStyles: false,
      cellHTML: false,
      bookVBA: false,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/password|encrypt/i.test(msg)) throw new ParseError('encrypted')
    if (e instanceof RangeError) throw new ParseError('too-large')
    throw new ParseError('corrupt', msg)
  }
}

/**
 * SheetJS 0.20 解析出的日期用 UTC 表示"表格里写的那个时间"（2016-06-07 → 2016-06-07T00:00Z）。
 * 转成本地时区的同一个钟面时间，否则在东八区会显示成 08:00。
 */
function utcToLocalWallClock(d: Date): Date {
  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  )
}

function cellToValue(cell: XLSX.CellObject | undefined): CellValue {
  if (!cell) return null
  switch (cell.t) {
    case 'n':
      // 自定义格式补零的数字（如 000123）按用户看到的文本处理
      if (typeof cell.w === 'string' && /^0\d+$/.test(cell.w)) return cell.w
      return typeof cell.v === 'number' ? cell.v : null
    case 'd':
      return cell.v instanceof Date ? utcToLocalWallClock(cell.v) : null
    case 's':
      return typeof cell.v === 'string' ? cell.v : null
    case 'b':
      return typeof cell.v === 'boolean' ? cell.v : null
    case 'e':
      return cell.w ?? null
    default:
      return null
  }
}

function isEmpty(v: CellValue | undefined): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '')
}

/**
 * 工作表 → 网格。行列都从 A1 开始，保证"第 N 行"与 Excel 一致；
 * 合并单元格用左上角的值填满整个区域；去掉末尾的空行空列。
 */
export function worksheetToGrid(ws: XLSX.WorkSheet): SheetGrid {
  const data = (ws['!data'] ?? []) as (XLSX.CellObject | undefined)[][]
  let lastRow = -1
  let lastCol = -1
  for (let r = 0; r < data.length; r++) {
    const row = data[r]
    if (!row) continue
    for (let c = row.length - 1; c >= 0; c--) {
      if (!isEmpty(cellToValue(row[c]))) {
        if (c > lastCol) lastCol = c
        lastRow = r
        break
      }
    }
  }

  const merges = ws['!merges'] ?? []

  const grid: SheetGrid = new Array(lastRow + 1)
  for (let r = 0; r <= lastRow; r++) {
    const src = data[r]
    const row: CellValue[] = new Array(lastCol + 1)
    for (let c = 0; c <= lastCol; c++) row[c] = cellToValue(src?.[c])
    grid[r] = row
  }

  for (const m of merges) {
    const v = grid[m.s.r]?.[m.s.c]
    if (v == null) continue
    for (let r = m.s.r; r <= Math.min(m.e.r, lastRow); r++) {
      const row = grid[r]
      if (!row) continue
      for (let c = m.s.c; c <= Math.min(m.e.c, lastCol); c++) row[c] = v
    }
  }
  return grid
}

export function csvToGrid(text: string): SheetGrid {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false })
  const rows = parsed.data
  let lastRow = rows.length - 1
  while (lastRow >= 0 && (rows[lastRow] ?? []).every((v) => isEmpty(v))) lastRow--
  const grid: SheetGrid = new Array(lastRow + 1)
  let width = 0
  for (let r = 0; r <= lastRow; r++) width = Math.max(width, rows[r]?.length ?? 0)
  for (let r = 0; r <= lastRow; r++) {
    const src = rows[r] ?? []
    const row: CellValue[] = new Array(width)
    for (let c = 0; c < width; c++) {
      const v = src[c]
      row[c] = v == null || v === '' ? null : v
    }
    grid[r] = row
  }
  return grid
}

export function gridInfo(name: string, grid: SheetGrid): SheetInfo {
  const colCount = grid.reduce((m, row) => Math.max(m, row.length), 0)
  const preview = grid.slice(0, PREVIEW_ROWS).map((row) => {
    const out: string[] = new Array(colCount)
    for (let c = 0; c < colCount; c++) out[c] = displayValue(row[c]) ?? ''
    return out
  })
  return { name, rowCount: grid.length, colCount, preview, suggestedHeaderRow: guessHeaderRow(grid) }
}

/**
 * 默认表头行：前 10 行里"不同非空值"最多的第一行。
 * 按不同值计数，是为了跳过合并单元格填满的大标题行。
 */
export function guessHeaderRow(grid: SheetGrid): number {
  let best = 0
  let bestCount = -1
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const count = new Set((grid[r] ?? []).filter((v) => !isEmpty(v)).map((v) => displayValue(v))).size
    if (count > bestCount) {
      best = r
      bestCount = count
    }
  }
  return best + 1
}

/**
 * 按表头行切出列式表格：
 * - 跳过整行为空的数据行，但保留原始行号
 * - 丢掉表头和数据都为空的列
 */
export function gridToTable(
  grid: SheetGrid,
  meta: { fileId: string; fileName: string; sheetName: string },
  headerRow: number,
): ParsedTable {
  if (headerRow < 1 || headerRow > grid.length) throw new ParseError('header-out-of-range')
  const headerCells = grid[headerRow - 1] ?? []
  const width = grid.reduce((m, row) => Math.max(m, row.length), 0)

  const dataRowIdx: number[] = []
  for (let r = headerRow; r < grid.length; r++) {
    if (!(grid[r] ?? []).every((v) => isEmpty(v))) dataRowIdx.push(r)
  }
  if (dataRowIdx.length === 0) throw new ParseError('empty-sheet')

  const keepCols: number[] = []
  for (let c = 0; c < width; c++) {
    if (!isEmpty(headerCells[c]) || dataRowIdx.some((r) => !isEmpty(grid[r]?.[c]))) keepCols.push(c)
  }

  const rawHeaders = keepCols.map((c) => displayValue(headerCells[c]) ?? '')
  // 空表头按原始列字母命名（"列C"），所以把原列号传进去
  const headers = normalizeHeaders(rawHeaders, keepCols)

  const columns: CellValue[][] = keepCols.map((c) => dataRowIdx.map((r) => grid[r]?.[c] ?? null))
  return {
    ...meta,
    headers,
    columns,
    rowNumbers: Int32Array.from(dataRowIdx, (r) => r + 1),
    rowCount: dataRowIdx.length,
  }
}
