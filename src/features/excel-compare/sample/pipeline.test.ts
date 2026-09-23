import { describe, expect, it } from 'vitest'

import { compareTables } from '../engine/compare'
import { DEFAULT_NORMALIZE_OPTIONS, type ParsedTable } from '../engine/types'
import { decodeCsvBytes } from '../parse/encoding'
import { csvToGrid, detectKind, gridInfo, gridToTable, readWorkbook, worksheetToGrid } from '../parse/sheet'
import { makeSampleFiles } from './makeSampleFiles'

/** 示例文件 → 解析 → 对比，走一遍和 Worker 相同的流程 */
function parse(name: string, bytes: Uint8Array, fileId: string): ParsedTable {
  const kind = detectKind(name, bytes)
  const grid =
    kind === 'csv'
      ? csvToGrid(decodeCsvBytes(bytes).text)
      : worksheetToGrid(readWorkbook(bytes).Sheets[readWorkbook(bytes).SheetNames[0]!]!)
  const header = gridInfo('s', grid).suggestedHeaderRow
  return gridToTable(grid, { fileId, fileName: name, sheetName: 's' }, header)
}

describe('示例文件全流程', () => {
  const samples = makeSampleFiles(1000, 3)
  const tables = samples.map((s, i) => parse(s.name, s.bytes, `f${i}`))

  it('自动识别表头行（A 文件跳过大标题）', () => {
    expect(tables[0]!.headers).toEqual(['工号', '姓名', '部门', '岗位', '入职日期', '学分'])
    expect(tables[1]!.headers[0]).toBe('员工编号')
    expect(tables[2]!.headers).toEqual(['工号', '姓名', '部门', '入职日期', '学分'])
    expect(tables[0]!.rowNumbers[0]).toBe(3)
  })

  it('前导零、日期、空格、缺失、重复、空主键都按预期处理', () => {
    const f = (label: string, ...columns: (string | null)[]) => ({ id: label, label, columns })
    const r = compareTables(tables, {
      fileIds: ['f0', 'f1', 'f2'],
      keyFields: [f('工号', '工号', '员工编号', '工号')],
      compareFields: [
        f('姓名', '姓名', '姓名', '姓名'),
        f('部门', '部门', '部门', '部门'),
        f('岗位', '岗位', '岗位', null),
        f('入职日期', '入职日期', '入职日期', '入职日期'),
        f('学分', '学分', '学分', '学分'),
      ],
      displayFields: [],
      normalize: DEFAULT_NORMALIZE_OPTIONS,
    })

    expect(r.keys[0]).toBe('000001')
    // 姓名只加了空格、日期只是格式不同：都不算差异
    expect(r.diff[0]!.includes(1)).toBe(false)
    expect(r.diff[3]!.includes(1)).toBe(false)
    // 部门和学分有真实差异
    expect(r.diff[1]!.includes(1)).toBe(true)
    expect(r.diff[4]!.includes(1)).toBe(true)
    expect(r.summary.missing).toBeGreaterThan(0)
    expect(r.summary.emptyKey).toBe(1)
    expect(r.summary.duplicateKey).toBe(4) // B 里两行 + A、C 各一行
    expect(r.excluded.find((e) => e.reason === 'empty-key')?.rowNumber).toBe(tables[0]!.rowCount + 2)
  })
})
