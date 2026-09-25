import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'

import { XLSX_STYLE, writeXlsx, type XlsxSheet } from './xlsxWriter'

/** 用 SheetJS 读回来检查：它能读出值、合并区域、自动筛选和填充色 */
function readBack(bytes: Uint8Array) {
  return XLSX.read(bytes, { type: 'array', cellStyles: true })
}

const sheet = (partial: Partial<XlsxSheet>): XlsxSheet => ({
  name: 'S',
  widths: [10, 10, 10],
  rows: () => {},
  ...partial,
})

describe('writeXlsx', () => {
  it('写出值、合并区域、自动筛选和冻结窗格', () => {
    const wb = readBack(
      writeXlsx([
        sheet({
          name: '对比结果',
          freeze: { rows: 2, cols: 1 },
          autoFilterRow: 2,
          merges: ['A1:A2', 'B1:C1'],
          rows: (emit) => {
            emit([{ v: '工号', s: XLSX_STYLE.header }, { v: '部门', s: XLSX_STYLE.groupHeader }, { v: '', s: XLSX_STYLE.groupHeader }])
            emit([{ v: '', s: XLSX_STYLE.header }, { v: 'A', s: XLSX_STYLE.header }, { v: 'B', s: XLSX_STYLE.header }])
            emit(['000001', '财务部', { v: '市场部', s: XLSX_STYLE.diff }])
            emit(['000002', { v: '—', s: XLSX_STYLE.missing }, null])
          },
        }),
      ]),
    )
    expect(wb.SheetNames).toEqual(['对比结果'])
    const ws = wb.Sheets['对比结果']!
    expect(XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })).toEqual([
      ['工号', '部门', null],
      [null, 'A', 'B'],
      ['000001', '财务部', '市场部'],
      ['000002', '—', null],
    ])
    // 编号类的值按文本写，前导零不会丢
    expect(ws['A3']!.t).toBe('s')
    expect(ws['!merges']!.map((m) => XLSX.utils.encode_range(m))).toEqual(['A1:A2', 'B1:C1'])
    expect(ws['!autofilter']).toEqual({ ref: 'A2:C4' })
    expect(ws['C3']!.s?.fgColor?.rgb).toBe('FEF3C7')
    expect(ws['B4']!.s?.fgColor?.rgb).toBe('F4F4F5')
  })

  it('转义 XML 特殊字符，去掉非法控制字符，保留首尾空格', () => {
    const wb = readBack(
      writeXlsx([sheet({ rows: (emit) => emit(['a<b>&"c"', 'x\u0001y', '  前后有空格 ']) })]),
    )
    const ws = wb.Sheets['S']!
    expect(ws['A1']!.v).toBe('a<b>&"c"')
    expect(ws['B1']!.v).toBe('xy')
    expect(ws['C1']!.v).toBe('  前后有空格 ')
  })

  it('工作表名去掉非法字符、截断、去重', () => {
    const wb = readBack(
      writeXlsx([
        sheet({ name: '结果/明细[1]' }),
        sheet({ name: '结果/明细[1]' }),
        sheet({ name: '一'.repeat(40) }),
      ]),
    )
    expect(wb.SheetNames[0]).toBe('结果 明细 1')
    expect(wb.SheetNames[1]).toBe('结果 明细 1(2)')
    expect(wb.SheetNames[2]).toHaveLength(31)
  })

  it('大量行也能写（跨越分块边界），重复值只存一次', () => {
    const bytes = writeXlsx([
      sheet({
        rows: (emit) => {
          for (let r = 0; r < 30_000; r++) emit([`K${r}`, `部门${r % 7}`, 'x'.repeat(40)])
        },
      }),
    ])
    const wb = readBack(bytes)
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['S']!, { header: 1 })
    expect(rows).toHaveLength(30_000)
    expect(rows[29_999]).toEqual(['K29999', `部门${29_999 % 7}`, 'x'.repeat(40)])
  })
})
