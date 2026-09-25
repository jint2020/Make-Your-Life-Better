import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'

import { compareTables } from '../engine/compare'
import { DEFAULT_NORMALIZE_OPTIONS, type CellValue, type FieldMapping, type ParsedTable } from '../engine/types'
import { buildExportSheets, exportStamp, statusText, type ExportRequest } from './buildExport'
import { writeXlsx } from './xlsxWriter'

function table(fileId: string, headers: string[], rows: CellValue[][]): ParsedTable {
  return {
    fileId,
    fileName: `${fileId}.xlsx`,
    sheetName: 'S',
    headers,
    columns: headers.map((_, c) => rows.map((r) => r[c] ?? null)),
    rowNumbers: Int32Array.from(rows, (_, i) => i + 2),
    rowCount: rows.length,
  }
}
const field = (label: string, ...columns: (string | null)[]): FieldMapping => ({ id: label, label, columns })

// 001：部门 A/C 一样、B 不一样；002：都一样；003：只在 A；004：只在 B 和 C；005：A 里重复
const A = table('A', ['工号', '部门', '岗位'], [
  ['001', '财务部', '经理'],
  ['002', '市场部', '主管'],
  ['003', '综合部', '专员'],
  ['005', '综合部', '专员'],
  ['005', '综合部', '专员'],
])
const B = table('B', ['工号', '部门', '岗位'], [
  ['001', '市场部', '经理'],
  ['002', '市场部', '主管'],
  ['004', '培训中心', '讲师'],
])
const C = table('C', ['工号', '部门'], [
  ['001', '财务部'],
  ['002', '市场部'],
  ['004', '培训中心'],
])
const result = compareTables([A, B, C], {
  fileIds: ['A', 'B', 'C'],
  keyFields: [field('工号', '工号', '工号', '工号')],
  compareFields: [field('部门', '部门', '部门', '部门'), field('岗位', '岗位', '岗位', null)],
  displayFields: [],
  normalize: DEFAULT_NORMALIZE_OPTIONS,
})
const rowOf = (key: string) => result.keys.indexOf(key)
const allRows = Int32Array.from(result.keys.map((_, i) => i))

function exportAndRead(req: ExportRequest) {
  const wb = XLSX.read(writeXlsx(buildExportSheets(result, req)), { type: 'array', cellStyles: true })
  const aoa = (name: string) => XLSX.utils.sheet_to_json<(string | null)[]>(wb.Sheets[name]!, { header: 1, defval: null })
  return { wb, aoa }
}

describe('buildExportSheets', () => {
  it('按字段并排：两行表头，没映射的列不导出', () => {
    const { wb, aoa } = exportAndRead({ rows: allRows, layout: 'field', onlyDiffColumns: false })
    expect(wb.SheetNames).toEqual(['对比结果', '差异明细', '未参与对比的行'])
    const rows = aoa('对比结果')
    expect(rows[0]).toEqual(['工号', '状态', '部门', null, null, '岗位', null])
    // C 没有岗位，所以岗位组只有 A、B 两列
    expect(rows[1]).toEqual([null, null, 'A · A.xlsx', 'B · B.xlsx', 'C · C.xlsx', 'A · A.xlsx', 'B · B.xlsx'])
    const ws = wb.Sheets['对比结果']!
    expect(ws['!merges']!.map((m) => XLSX.utils.encode_range(m))).toEqual(['A1:A2', 'B1:B2', 'C1:E1', 'F1:G1'])
    expect(ws['!autofilter']).toEqual({ ref: `A2:G${2 + result.keys.length}` })
  })

  it('只标出不一样的那个文件；缺失写"—"并标灰', () => {
    const { wb } = exportAndRead({ rows: Int32Array.of(rowOf('001'), rowOf('003')), layout: 'field', onlyDiffColumns: false })
    const ws = wb.Sheets['对比结果']!
    // 第 3 行是 001：部门 A 财务部、B 市场部（标黄）、C 财务部
    expect([ws['C3']!.v, ws['D3']!.v, ws['E3']!.v]).toEqual(['财务部', '市场部', '财务部'])
    expect(ws['C3']!.s?.fgColor?.rgb).toBeUndefined()
    expect(ws['D3']!.s?.fgColor?.rgb).toBe('FEF3C7')
    expect(ws['B3']!.v).toBe('部门')
    // 第 4 行是 003：只在 A，B、C 缺失
    expect(ws['B4']!.v).toBe('缺 B；缺 C')
    expect(ws['D4']!.v).toBe('—')
    expect(ws['D4']!.s?.fgColor?.rgb).toBe('F4F4F5')
  })

  it('行的范围和顺序跟随请求（页面上的筛选和排序）', () => {
    const { aoa } = exportAndRead({ rows: Int32Array.of(rowOf('002'), rowOf('001')), layout: 'field', onlyDiffColumns: false })
    expect(aoa('对比结果').slice(2).map((r) => r[0])).toEqual(['002', '001'])
  })

  it('按文件分组；只显示有差异的列时不导出没有差异的字段', () => {
    const { aoa } = exportAndRead({ rows: allRows, layout: 'file', onlyDiffColumns: true })
    const rows = aoa('对比结果')
    // 岗位没有任何差异，被隐藏；每个文件组只剩"部门"
    expect(rows[0]).toEqual(['工号', '状态', 'A · A.xlsx', 'B · B.xlsx', 'C · C.xlsx'])
    expect(rows[1]).toEqual([null, null, '部门', '部门', '部门'])
  })

  it('差异明细：每处差异一行', () => {
    const { wb, aoa } = exportAndRead({ rows: allRows, layout: 'field', onlyDiffColumns: false })
    expect(aoa('差异明细')).toEqual([
      ['工号', '字段', 'A · A.xlsx', 'B · B.xlsx', 'C · C.xlsx'],
      ['001', '部门', '财务部', '市场部', '财务部'],
    ])
    expect(wb.Sheets['差异明细']!['D2']!.s?.fgColor?.rgb).toBe('FEF3C7')
  })

  it('未参与对比的行', () => {
    const { aoa } = exportAndRead({ rows: allRows, layout: 'field', onlyDiffColumns: false })
    expect(aoa('未参与对比的行')).toEqual([
      ['文件', '行号', '主键', '原因'],
      ['A · A.xlsx', '5', '005', '主键在 A 中重复'],
      ['A · A.xlsx', '6', '005', '主键在 A 中重复'],
    ])
  })
})

describe('statusText / exportStamp', () => {
  it('状态文字和页面一致', () => {
    expect(statusText(result, rowOf('002'))).toBe('全部一致')
    expect(statusText(result, rowOf('001'))).toBe('部门')
    expect(statusText(result, rowOf('004'))).toBe('缺 A')
  })
  it('时间戳', () => {
    expect(exportStamp(new Date(2026, 8, 5, 9, 7))).toBe('20260905-0907')
  })
})
