import { describe, expect, it } from 'vitest'

import { compareTables } from '../engine/compare'
import { DEFAULT_NORMALIZE_OPTIONS, type CellValue, type FieldMapping, type ParsedTable } from '../engine/types'
import { filterRows, sortRows } from './rowOrder'

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

// 结果行顺序：003、001、002（A 的顺序），004 只在 B
const A = table('A', ['工号', '部门', '备注'], [
  ['003', '市场部', '甲'],
  ['001', '财务部', '乙'],
  ['002', '财务部', null],
])
const B = table('B', ['工号', '部门'], [
  ['001', '财务部'],
  ['002', '综合部'],
  ['003', '市场部'],
  ['004', '培训中心'],
])
const result = compareTables([A, B], {
  fileIds: ['A', 'B'],
  keyFields: [field('工号', '工号', '工号')],
  compareFields: [field('部门', '部门', '部门')],
  displayFields: [field('备注', '备注', null)],
  normalize: DEFAULT_NORMALIZE_OPTIONS,
})
const keysOf = (rows: Int32Array) => Array.from(rows, (i) => result.keys[i])

describe('filterRows', () => {
  it('全部', () => {
    expect(keysOf(filterRows(result, 'all', ''))).toEqual(['003', '001', '002', '004'])
  })
  it('按标签筛选，保持原顺序', () => {
    expect(keysOf(filterRows(result, 'diff', ''))).toEqual(['002'])
    expect(keysOf(filterRows(result, 'missing', ''))).toEqual(['004'])
    expect(keysOf(filterRows(result, 'equal', ''))).toEqual(['003', '001'])
  })
  it('主键搜索（忽略首尾空格），可以和标签一起用', () => {
    expect(keysOf(filterRows(result, 'all', ' 00 '))).toEqual(['003', '001', '002', '004'])
    expect(keysOf(filterRows(result, 'equal', '1'))).toEqual(['001'])
    expect(keysOf(filterRows(result, 'all', 'x'))).toEqual([])
  })
})

describe('sortRows', () => {
  const all = filterRows(result, 'all', '')

  it('没有排序设置时原样返回', () => {
    expect(sortRows(result, all, [])).toBe(all)
  })
  it('按主键升序、降序', () => {
    expect(keysOf(sortRows(result, all, [{ colId: 'key', sort: 'asc' }]))).toEqual(['001', '002', '003', '004'])
    expect(keysOf(sortRows(result, all, [{ colId: 'key', sort: 'desc' }]))).toEqual(['004', '003', '002', '001'])
  })
  it('按某个文件的值排序：这一行不在该文件里时当空值，排在最前', () => {
    // A 的部门：003 市场部、001 财务部、002 财务部、004 缺失。
    // 和 AG Grid 默认一样按字符编码比较（不是拼音）："市" U+5E02 < "财" U+8D22
    expect(keysOf(sortRows(result, all, [{ colId: 'v_0_0', sort: 'asc' }]))).toEqual(['004', '003', '001', '002'])
  })
  it('多列排序；值相同保持原顺序', () => {
    const sorted = sortRows(result, all, [
      { colId: 'v_0_0', sort: 'desc' },
      { colId: 'key', sort: 'desc' },
    ])
    expect(keysOf(sorted)).toEqual(['002', '001', '003', '004'])
    // 只按 A 的部门排：001、002 都是财务部，保持原来 001 在前
    expect(keysOf(sortRows(result, all, [{ colId: 'v_0_0', sort: 'desc' }]))).toEqual(['001', '002', '003', '004'])
  })
  it('按展示列排序；不认识的列忽略', () => {
    // 备注：003 甲、001 乙、002 空、004 空（只在 B，B 没有备注）；"乙" U+4E59 < "甲" U+7532
    expect(keysOf(sortRows(result, all, [{ colId: 'display_0', sort: 'asc' }]))).toEqual(['002', '004', '001', '003'])
    expect(sortRows(result, all, [{ colId: 'status', sort: 'asc' }])).toBe(all)
  })
})
