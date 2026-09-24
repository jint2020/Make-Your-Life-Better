import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'

import {
  csvToGrid,
  detectKind,
  gridInfo,
  gridToTable,
  guessHeaderRow,
  readWorkbook,
  worksheetToGrid,
} from './sheet'

function makeXlsx(aoa: unknown[][], merges: XLSX.Range[] = []): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })
  ws['!merges'] = merges
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '花名册')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'Sheet2')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

const META = { fileId: 'f1', fileName: 'a.xlsx', sheetName: '花名册' }

describe('detectKind', () => {
  const zip = new Uint8Array([0x50, 0x4b, 3, 4])
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])
  it('识别 xlsx / csv', () => {
    expect(detectKind('a.xlsx', zip)).toBe('xlsx')
    expect(detectKind('a.CSV', new Uint8Array([0x61]))).toBe('csv')
  })
  it('拒绝 xls、其他类型、加密文件', () => {
    expect(() => detectKind('a.xls', ole)).toThrow(/xls/)
    expect(() => detectKind('a.pdf', zip)).toThrow(/只支持/)
    expect(() => detectKind('a.xlsx', ole)).toThrow(/密码/)
    expect(() => detectKind('a.xlsx', new Uint8Array([1, 2, 3, 4]))).toThrow(/损坏/)
  })
})

describe('xlsx → 网格 → 表格', () => {
  it('读取多个工作表、日期、合并单元格填充、去掉空列空行', () => {
    const bytes = makeXlsx(
      [
        ['2026 年 9 月花名册'],
        ['工号', '姓名', '部门', null, '入职日期'],
        ['001', '张三', '培训中心', null, new Date(2024, 0, 5)],
        ['002', '李四', null, null, new Date(2023, 5, 1)],
        [null, null, null, null, null],
        [3, '王五', '市场部', null, null],
      ],
      // 部门 C3:C4 合并；标题 A1:E1 合并
      [
        { s: { r: 2, c: 2 }, e: { r: 3, c: 2 } },
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      ],
    )
    const wb = readWorkbook(bytes)
    expect(wb.SheetNames).toEqual(['花名册', 'Sheet2'])

    const grid = worksheetToGrid(wb.Sheets['花名册']!)
    expect(grid).toHaveLength(6)
    expect(grid[0]).toEqual(Array(5).fill('2026 年 9 月花名册'))
    expect(grid[3]?.[2]).toBe('培训中心')

    expect(guessHeaderRow(grid)).toBe(2) // 跳过合并填满的标题行
    const table = gridToTable(grid, META, 2)
    expect(table.headers).toEqual(['工号', '姓名', '部门', '入职日期'])
    expect(table.rowCount).toBe(3)
    expect(Array.from(table.rowNumbers)).toEqual([3, 4, 6])
    expect(table.columns[0]).toEqual(['001', '002', 3])
    expect(table.columns[2]).toEqual(['培训中心', '培训中心', '市场部'])
    const d = table.columns[3]?.[0]
    expect(d).toBeInstanceOf(Date)
    // 本地时区的零点，而不是 UTC 零点（东八区不能变成 08:00）
    expect([(d as Date).getFullYear(), (d as Date).getMonth(), (d as Date).getDate(), (d as Date).getHours()]).toEqual([
      2024, 0, 5, 0,
    ])
  })

  it('空表头按原列字母命名，重名列加序号', () => {
    const grid = worksheetToGrid(
      readWorkbook(makeXlsx([['工号', null, '姓名', '姓名'], ['1', 'x', 'a', 'b']])).Sheets['花名册']!,
    )
    expect(gridToTable(grid, META, 1).headers).toEqual(['工号', '列B', '姓名', '姓名(2)'])
  })

  it('补零格式的数字按显示文本读取', () => {
    const ws = XLSX.utils.aoa_to_sheet([['工号'], [123]])
    ws['A2']!.z = '000000'
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'S')
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
    const grid = worksheetToGrid(readWorkbook(bytes).Sheets['S']!)
    expect(grid[1]?.[0]).toBe('000123')
  })

  it('表头下面没数据、表头行越界都报错', () => {
    const grid = worksheetToGrid(readWorkbook(makeXlsx([['工号', '姓名']])).Sheets['花名册']!)
    expect(() => gridToTable(grid, META, 1)).toThrow(/没有数据/)
    expect(() => gridToTable(grid, META, 5)).toThrow(/超出/)
  })

  it('损坏的文件报 corrupt', () => {
    expect(() => readWorkbook(new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9]))).toThrow(/损坏/)
  })
})

describe('csv → 网格', () => {
  it('解析引号、逗号，去掉末尾空行，空串视为空', () => {
    const grid = csvToGrid('工号,姓名,备注\n001,"张,三",\n002,李四,"多\n行"\n\n\n')
    expect(grid).toEqual([
      ['工号', '姓名', '备注'],
      ['001', '张,三', null],
      ['002', '李四', '多\n行'],
    ])
  })

  it('gridInfo 生成预览文本', () => {
    const info = gridInfo('CSV', [['a', 1, null], [new Date(2024, 1, 3), true]])
    expect(info).toMatchObject({ rowCount: 2, colCount: 3, suggestedHeaderRow: 1 })
    expect(info.preview).toEqual([
      ['a', '1', ''],
      ['2024-02-03', 'TRUE', ''],
    ])
  })
})
