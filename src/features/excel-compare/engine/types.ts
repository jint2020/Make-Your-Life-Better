/**
 * Excel 对比的领域类型。
 *
 * 数据流：File → (Worker 解析) → ParsedTable（列式）→ (Worker 对比) → CompareResult → AG Grid
 */

/** 解析后的单元格原始值。xlsx 日期格式单元格会解析成 Date */
export type CellValue = string | number | boolean | Date | null

/** 列式存储：columns[c][r]，比行式对象省内存，传给 Worker 也更快 */
export interface ParsedTable {
  fileId: string
  fileName: string
  sheetName: string
  headers: string[]
  columns: CellValue[][]
  rowCount: number
}

export interface SourceFileOptions {
  sheetName?: string
  /** 表头所在行，从 1 开始 */
  headerRow: number
  /** 仅 CSV：null 表示自动检测 */
  encoding?: 'utf-8' | 'gb18030' | null
}

export interface NormalizeOptions {
  ignoreCase: boolean
  fullToHalf: boolean
  /** 开：'001' ≠ '1'（按文本比）；关：'001' = '1'（按数值比） */
  keepLeadingZeros: boolean
}

export const DEFAULT_NORMALIZE_OPTIONS: NormalizeOptions = {
  ignoreCase: false,
  fullToHalf: false,
  keepLeadingZeros: true,
}

/** 一个"逻辑字段"在各文件里对应的列名；null 表示该文件没有这个字段 */
export interface FieldMapping {
  id: string
  label: string
  columns: (string | null)[]
}

export interface CompareConfig {
  /** 参与对比的文件顺序，2～3 个 */
  fileIds: string[]
  /** 组合主键：每个元素是一个逻辑字段 */
  keyFields: FieldMapping[]
  compareFields: FieldMapping[]
  /** 附带展示列：只展示不比较 */
  displayFields: FieldMapping[]
  normalize: NormalizeOptions
}

/** 一行可以同时带多个标签 */
export type RowTag = 'equal' | 'diff' | 'missing'

export type ExcludedReason = 'duplicate-key' | 'empty-key'

export interface CompareSummary {
  total: number
  equal: number
  diff: number
  missing: number
  duplicateKey: number
  emptyKey: number
}

/** 行标签位掩码 */
export const TAG_EQUAL = 1
export const TAG_DIFF = 2
export const TAG_MISSING = 4

/**
 * 对比结果（列式）。这是 Worker 交给结果表的契约：
 * 表格的 rowData 只放行号 { i }，各列通过 valueGetter 读下面这些数组，
 * 这样 10 万行也不用在主线程上创建 10 万个大对象。
 */
export interface CompareResult {
  files: { fileId: string; fileName: string }[]
  keyLabel: string
  fieldLabels: string[]
  /** 每行主键的展示文本 */
  keys: string[]
  /** 每行标签位掩码（TAG_*） */
  tags: Uint8Array
  /** 每行在各文件中是否存在：第 f 位为 1 表示存在于第 f 个文件 */
  presence: Uint8Array
  /** values[file][field][row]：展示用原始文本 */
  values: (string | null)[][][]
  /** diff[field][row]：1 表示该字段在这一行各文件之间不一致 */
  diff: Uint8Array[]
  summary: CompareSummary
  elapsedMs: number
}
