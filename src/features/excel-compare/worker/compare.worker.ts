import { expose, transfer } from 'comlink'
import type * as XLSX from 'xlsx'

import { compareTables, CompareConfigError } from '../engine/compare'
import type { CompareConfig, CompareResult, ParsedTable } from '../engine/types'
import { decodeCsvBytes, type CsvEncoding } from '../parse/encoding'
import { toErrorInfo } from '../parse/errors'
import {
  csvToGrid,
  detectKind,
  gridInfo,
  gridToTable,
  readWorkbook,
  worksheetToGrid,
} from '../parse/sheet'
import type {
  FileKind,
  InspectResult,
  Result,
  SheetGrid,
  SheetInfo,
  TableSummary,
} from '../parse/types'
import { makeSampleFiles, type SampleFile } from '../sample/makeSampleFiles'

/**
 * Excel 对比 Worker。
 *
 * 大数据只留在 Worker 里：工作簿、网格、解析后的表格都存在这里，
 * 主线程只拿预览、表头摘要和最终的对比结果。
 */

interface StoredFile {
  fileName: string
  kind: FileKind
  size: number
  /** 仅 CSV：保留原始字节，切换编码时重新解码 */
  bytes?: Uint8Array
  workbook?: XLSX.WorkBook
  grids: Map<string, SheetGrid>
  table?: ParsedTable
}

const CSV_SHEET = 'CSV'
const files = new Map<string, StoredFile>()

function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

function fail<T>(e: unknown): Result<T> {
  return { ok: false, error: toErrorInfo(e) }
}

function getGrid(stored: StoredFile, sheetName: string): SheetGrid {
  let grid = stored.grids.get(sheetName)
  if (!grid) {
    const ws = stored.workbook?.Sheets[sheetName]
    grid = ws ? worksheetToGrid(ws) : []
    stored.grids.set(sheetName, grid)
  }
  return grid
}

function loadCsv(stored: StoredFile, encoding: CsvEncoding | null): CsvEncoding {
  const decoded = decodeCsvBytes(stored.bytes!, encoding)
  stored.grids.set(CSV_SHEET, csvToGrid(decoded.text))
  stored.table = undefined
  return decoded.encoding
}

function toInspect(fileId: string, stored: StoredFile, encoding: CsvEncoding | null): InspectResult {
  return {
    fileId,
    fileName: stored.fileName,
    kind: stored.kind,
    size: stored.size,
    sheetNames: stored.kind === 'csv' ? [CSV_SHEET] : (stored.workbook?.SheetNames ?? []),
    encoding,
  }
}

const api = {
  async inspectFile(fileId: string, file: File): Promise<Result<InspectResult>> {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const kind = detectKind(file.name, bytes)
      const stored: StoredFile = { fileName: file.name, kind, size: file.size, grids: new Map() }
      let encoding: CsvEncoding | null = null
      if (kind === 'csv') {
        stored.bytes = bytes
        encoding = loadCsv(stored, null)
      } else {
        stored.workbook = readWorkbook(bytes)
      }
      files.set(fileId, stored)
      return ok(toInspect(fileId, stored, encoding))
    } catch (e) {
      return fail(e)
    }
  },

  /** 仅 CSV：换编码重新解码 */
  setCsvEncoding(fileId: string, encoding: CsvEncoding | null): Result<InspectResult> {
    try {
      const stored = files.get(fileId)
      if (!stored?.bytes) return { ok: false, error: { code: 'not-found', message: '文件已失效，请重新上传。' } }
      return ok(toInspect(fileId, stored, loadCsv(stored, encoding)))
    } catch (e) {
      return fail(e)
    }
  },

  getSheetInfo(fileId: string, sheetName: string): Result<SheetInfo> {
    try {
      const stored = files.get(fileId)
      if (!stored) return { ok: false, error: { code: 'not-found', message: '文件已失效，请重新上传。' } }
      return ok(gridInfo(sheetName, getGrid(stored, sheetName)))
    } catch (e) {
      return fail(e)
    }
  },

  extractTable(fileId: string, sheetName: string, headerRow: number): Result<TableSummary> {
    try {
      const stored = files.get(fileId)
      if (!stored) return { ok: false, error: { code: 'not-found', message: '文件已失效，请重新上传。' } }
      const table = gridToTable(
        getGrid(stored, sheetName),
        { fileId, fileName: stored.fileName, sheetName },
        headerRow,
      )
      stored.table = table
      // 选定工作表后，其他工作表的网格不再需要
      for (const name of stored.grids.keys()) if (name !== sheetName) stored.grids.delete(name)
      return ok({ fileId, sheetName, headers: table.headers, rowCount: table.rowCount })
    } catch (e) {
      return fail(e)
    }
  },

  compare(config: CompareConfig): Result<CompareResult> {
    try {
      const tables = config.fileIds.map((id) => {
        const t = files.get(id)?.table
        if (!t) throw new CompareConfigError('有文件还没有解析完成，请回到上一步')
        return t
      })
      const result = compareTables(tables, config)
      return transfer(ok(result), [
        result.tags.buffer,
        result.presence.buffer,
        ...result.diff.map((d) => d.buffer),
      ] as ArrayBuffer[])
    } catch (e) {
      if (e instanceof CompareConfigError) return { ok: false, error: { code: 'unknown', message: e.message } }
      return fail(e)
    }
  },

  disposeFile(fileId: string): void {
    files.delete(fileId)
  },

  makeSampleFiles(rowCount: number, fileCount: 2 | 3): SampleFile[] {
    const samples = makeSampleFiles(rowCount, fileCount)
    return transfer(
      samples,
      samples.map((s) => s.bytes.buffer as ArrayBuffer),
    )
  },
}

export type CompareWorkerApi = typeof api

expose(api)
