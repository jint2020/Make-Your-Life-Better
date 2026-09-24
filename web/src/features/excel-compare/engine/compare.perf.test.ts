import { describe, expect, it } from 'vitest'

import { compareTables } from './compare'
import { DEFAULT_NORMALIZE_OPTIONS, type CellValue, type ParsedTable } from './types'

/**
 * 性能目标：3 个文件 × 10 万行 × 20 列，对比 ≤ 5 秒（设计文档）。
 * 这里只测引擎本身；浏览器里还要加上 Worker 传输和表格渲染。
 */
const ROWS = 100_000
const COLS = 20

function makeTable(fileId: string, seed: number): ParsedTable {
  const headers = ['工号', ...Array.from({ length: COLS - 1 }, (_, i) => `字段${i + 1}`)]
  const columns: CellValue[][] = headers.map(() => new Array(ROWS))
  for (let r = 0; r < ROWS; r++) {
    // 每个文件缺一些行、改一些值
    const id = (r * 7 + seed) % 23 === 0 ? `X${seed}-${r}` : `FS${100000 + r}`
    columns[0]![r] = id
    for (let c = 1; c < COLS; c++) {
      const changed = (r + c * 13 + seed) % 97 === 0
      const kind = c % 4
      columns[c]![r] =
        kind === 0
          ? r * c + (changed ? 1 : 0)
          : kind === 1
            ? `部门${(r + c) % 40}${changed ? '*' : ''}`
            : kind === 2
              ? new Date(2020, (r + c) % 12, 1 + ((r + (changed ? 1 : 0)) % 28))
              : String(((r * c) % 1000) + (changed ? 1 : 0))
    }
  }
  return {
    fileId,
    fileName: `${fileId}.xlsx`,
    sheetName: 'S',
    headers,
    columns,
    rowNumbers: Int32Array.from({ length: ROWS }, (_, i) => i + 2),
    rowCount: ROWS,
  }
}

describe('性能', () => {
  it(`3 × ${ROWS.toLocaleString()} 行 × ${COLS} 列 ≤ 5 秒`, () => {
    const tables = [makeTable('A', 0), makeTable('B', 1), makeTable('C', 2)]
    const fields = tables[0]!.headers.map((h) => ({ id: h, label: h, columns: [h, h, h] }))
    const result = compareTables(tables, {
      fileIds: ['A', 'B', 'C'],
      keyFields: [fields[0]!],
      compareFields: fields.slice(1),
      displayFields: [],
      normalize: DEFAULT_NORMALIZE_OPTIONS,
    })
    console.log(
      `对比用时 ${result.elapsedMs.toFixed(0)} ms，结果 ${result.summary.total} 行，差异 ${result.summary.diff}，缺失 ${result.summary.missing}`,
    )
    expect(result.summary.total).toBeGreaterThan(ROWS)
    expect(result.elapsedMs).toBeLessThan(5_000)
  }, 30_000)
})
