import { describe, expect, it } from 'vitest'

import { compareTables } from './compare'
import {
  DEFAULT_NORMALIZE_OPTIONS,
  TAG_DIFF,
  TAG_EQUAL,
  TAG_MISSING,
  type CellValue,
  type CompareConfig,
  type FieldMapping,
  type ParsedTable,
} from './types'

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

function config(tables: number, partial: Partial<CompareConfig>): CompareConfig {
  return {
    fileIds: Array.from({ length: tables }, (_, i) => `f${i}`),
    keyFields: [],
    compareFields: [],
    displayFields: [],
    normalize: DEFAULT_NORMALIZE_OPTIONS,
    ...partial,
  }
}

const A = table('A', ['工号', '姓名', '部门'], [
  ['001', '张三', '培训中心'],
  ['002', '李四', '市场部'],
  ['003', '王五', '财务部'],
])
const B = table('B', ['员工编号', '姓名', '部门'], [
  ['002', '李四', '政企部'],
  ['001', ' 张三 ', '培训中心'],
  ['004', '赵六', '综合部'],
])

describe('compareTables：两个文件', () => {
  const r = compareTables(
    [A, B],
    config(2, {
      keyFields: [field('工号', '工号', '员工编号')],
      compareFields: [field('姓名', '姓名', '姓名'), field('部门', '部门', '部门')],
    }),
  )

  it('按主键合并，顺序为 A 的顺序再补 B 独有的', () => {
    expect(r.keys).toEqual(['001', '002', '003', '004'])
    expect(Array.from(r.presence)).toEqual([0b11, 0b11, 0b01, 0b10])
  })

  it('逐字段比较，空格不算差异', () => {
    expect(Array.from(r.diff[0]!)).toEqual([0, 0, 0, 0]) // 姓名
    expect(Array.from(r.diff[1]!)).toEqual([0, 1, 0, 0]) // 部门
    expect(r.values[1]![1]![1]).toBe('政企部')
    expect(r.values[1]![0]![2]).toBeNull() // 003 在 B 缺失
  })

  it('标签和汇总', () => {
    expect(Array.from(r.tags)).toEqual([TAG_EQUAL, TAG_DIFF, TAG_MISSING, TAG_MISSING])
    expect(r.summary).toMatchObject({ total: 4, equal: 1, diff: 1, missing: 2, duplicateKey: 0, emptyKey: 0 })
    expect(r.keyLabel).toBe('工号')
  })

  it('不选对比字段时退化为集合对比', () => {
    const s = compareTables([A, B], config(2, { keyFields: [field('工号', '工号', '员工编号')] }))
    expect(s.summary).toMatchObject({ total: 4, equal: 2, missing: 2, diff: 0 })
  })
})

describe('compareTables：三个文件、同时有差异和缺失', () => {
  const C = table('C', ['工号', '部门'], [['001', '培训中心'], ['002', '市场部']])
  const r = compareTables(
    [A, B, C],
    config(3, {
      keyFields: [field('工号', '工号', '员工编号', '工号')],
      compareFields: [field('部门', '部门', '部门', '部门'), field('姓名', '姓名', '姓名', null)],
    }),
  )

  it('一行可以同时带"有差异"和"缺失"', () => {
    const i = r.keys.indexOf('002')
    expect(r.tags[i]).toBe(TAG_DIFF)
    const j = r.keys.indexOf('003') // 只在 A
    expect(r.tags[j]).toBe(TAG_MISSING)
    const k = r.keys.indexOf('004') // 只在 B
    expect(r.tags[k]).toBe(TAG_MISSING)
  })

  it('某个文件没有映射的字段不参与比较', () => {
    const i = r.keys.indexOf('001')
    expect(r.diff[1]![i]).toBe(0)
    expect(r.values[2]![1]![i]).toBeNull()
  })
})

describe('compareTables：主键异常', () => {
  const X = table('X', ['工号', '值'], [
    ['1', 'a'],
    ['', 'b'],
    ['2', 'c'],
    ['2', 'd'],
    ['3', 'e'],
  ])
  const Y = table('Y', ['工号', '值'], [
    ['2', 'c'],
    ['3', 'e'],
    ['1', 'a'],
  ])
  const r = compareTables(
    [X, Y],
    config(2, { keyFields: [field('工号', '工号', '工号')], compareFields: [field('值', '值', '值')] }),
  )

  it('空主键、重复主键的行不参与对比，但全部列出', () => {
    expect(r.keys).toEqual(['1', '3'])
    expect(r.summary).toMatchObject({ total: 2, equal: 2, emptyKey: 1, duplicateKey: 3 })
    expect(r.excluded).toEqual([
      { fileIndex: 0, rowNumber: 3, keyText: '', reason: 'empty-key' },
      { fileIndex: 0, rowNumber: 4, keyText: '2', reason: 'duplicate-key', duplicateIn: [0] },
      { fileIndex: 0, rowNumber: 5, keyText: '2', reason: 'duplicate-key', duplicateIn: [0] },
      { fileIndex: 1, rowNumber: 2, keyText: '2', reason: 'duplicate-key', duplicateIn: [0] },
    ])
  })
})

describe('compareTables：组合主键与展示列', () => {
  const P = table('P', ['姓名', '身份证', '电话', '部门'], [
    ['张三', '440600199001011234', '138', '甲'],
    ['张三', '440600199001011235', '139', '乙'],
  ])
  const Q = table('Q', ['姓名', '身份证', '部门'], [
    ['张三', '440600199001011235', '丙'],
    ['张三', '440600199001011234', '甲'],
  ])
  const r = compareTables(
    [P, Q],
    config(2, {
      keyFields: [field('姓名', '姓名', '姓名'), field('身份证', '身份证', '身份证')],
      compareFields: [field('部门', '部门', '部门')],
      displayFields: [field('电话', '电话', null)],
    }),
  )

  it('组合主键区分同名的人，身份证不会因精度被当成同一个', () => {
    expect(r.keys).toEqual(['张三 / 440600199001011234', '张三 / 440600199001011235'])
    expect(Array.from(r.diff[0]!)).toEqual([0, 1])
    expect(r.keyLabel).toBe('姓名 + 身份证')
  })

  it('展示列取第一个有值的文件', () => {
    expect(r.displayLabels).toEqual(['电话'])
    expect(r.displayValues[0]).toEqual(['138', '139'])
  })
})

describe('compareTables：配置错误', () => {
  it('主键没映射到所有文件时报错', () => {
    expect(() =>
      compareTables([A, B], config(2, { keyFields: [field('工号', '工号', null)] })),
    ).toThrow(/没有映射/)
  })
})
