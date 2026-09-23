import type { CellValue } from '../engine/types'
import type { CsvEncoding } from './encoding'

export type FileKind = 'xlsx' | 'csv'

/** 一个工作表的原始网格（行优先，已做合并单元格填充），行号 = 下标 + 1 */
export type SheetGrid = CellValue[][]

export interface SheetInfo {
  name: string
  rowCount: number
  colCount: number
  /** 前若干行的展示文本，用于选表头时预览 */
  preview: string[][]
  /** 猜测的表头行（从 1 开始） */
  suggestedHeaderRow: number
}

export interface InspectResult {
  fileId: string
  fileName: string
  kind: FileKind
  size: number
  sheetNames: string[]
  /** 仅 CSV：实际使用的编码 */
  encoding: CsvEncoding | null
}

export interface TableSummary {
  fileId: string
  sheetName: string
  headers: string[]
  rowCount: number
}

export type ParseErrorCode =
  | 'unsupported-xls'
  | 'unsupported-type'
  | 'encrypted'
  | 'corrupt'
  | 'empty-sheet'
  | 'header-out-of-range'
  | 'too-large'
  | 'not-found'
  | 'unknown'

export interface ParseErrorInfo {
  code: ParseErrorCode
  message: string
}

/** Worker 返回值用 Result 而不是抛错：Comlink 跨线程时会丢掉自定义错误字段 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: ParseErrorInfo }
