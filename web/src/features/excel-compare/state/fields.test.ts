import { describe, expect, it } from 'vitest'

import { applyBulkRole, buildFieldRows, validateFieldRows } from './fields'

describe('buildFieldRows', () => {
  it('同名列自动配对，没配上的追加，猜主键', () => {
    const rows = buildFieldRows([
      ['员工编号', '姓名', '部门', '备注'],
      ['员工编号', '姓名', '岗位'],
      ['员工编号', '部门', '岗位'],
    ])
    expect(rows.map((r) => [r.label, r.role, r.columns])).toEqual([
      ['员工编号', 'key', ['员工编号', '员工编号', '员工编号']],
      ['姓名', 'compare', ['姓名', '姓名', null]],
      ['部门', 'compare', ['部门', null, '部门']],
      ['备注', 'ignore', ['备注', null, null]],
      ['岗位', 'compare', [null, '岗位', '岗位']],
    ])
  })

  it('主键列名不一致（工号 / 员工编号）时自动配上', () => {
    const rows = buildFieldRows([
      ['工号', '姓名'],
      ['员工编号', '姓名'],
      ['工号', '姓名'],
    ])
    expect(rows.map((r) => [r.label, r.role, r.columns])).toEqual([
      ['工号', 'key', ['工号', '员工编号', '工号']],
      ['姓名', 'compare', ['姓名', '姓名', '姓名']],
    ])
  })

  it('像主键的候选列不止一个时不猜，交给用户选', () => {
    const rows = buildFieldRows([
      ['工号', '姓名'],
      ['员工编号', '身份证号', '姓名'],
    ])
    expect(rows.find((r) => r.role === 'key')).toBeUndefined()
    expect(validateFieldRows(rows).errors).toContain('请至少选择一个主键字段。')
  })
})

describe('validateFieldRows', () => {
  it('主键必须映射到所有文件', () => {
    const v = validateFieldRows([{ id: 'a', label: '工号', role: 'key', columns: ['工号', null] }])
    expect(v.errors[0]).toMatch(/每个文件/)
  })
  it('没有对比字段时给提示而不是报错', () => {
    const v = validateFieldRows([{ id: 'a', label: '工号', role: 'key', columns: ['工号', '工号'] }])
    expect(v.errors).toEqual([])
    expect(v.hints[0]).toMatch(/只会比较/)
  })
})

describe('applyBulkRole', () => {
  const rows = buildFieldRows([
    ['工号', '姓名', '部门', '备注'],
    ['工号', '姓名', '部门'],
  ])

  it('全部设为忽略：主键不动', () => {
    const r = applyBulkRole(rows, 'ignore')
    expect(r.rows.map((x) => x.role)).toEqual(['key', 'ignore', 'ignore', 'ignore'])
    expect(r).toMatchObject({ applied: 3, keptKeys: 1, skippedSingle: 0 })
  })

  it('全部设为对比：跳过只在一个文件里出现的字段', () => {
    const ignored = applyBulkRole(rows, 'ignore').rows
    const r = applyBulkRole(ignored, 'compare')
    expect(r.rows.map((x) => x.role)).toEqual(['key', 'compare', 'compare', 'ignore'])
    expect(r).toMatchObject({ applied: 2, keptKeys: 1, skippedSingle: 1 })
  })

  it('全部设为只展示：只在一个文件里的字段也可以', () => {
    const r = applyBulkRole(rows, 'display')
    expect(r.rows.map((x) => x.role)).toEqual(['key', 'display', 'display', 'display'])
  })

  it('不修改原数组（撤销要用）', () => {
    const before = rows.map((x) => x.role)
    applyBulkRole(rows, 'ignore')
    expect(rows.map((x) => x.role)).toEqual(before)
  })
})
