import { describe, expect, it } from 'vitest'

import { columnLetter, normalizeHeaders } from './headers'

describe('columnLetter', () => {
  it.each([
    [0, 'A'],
    [2, 'C'],
    [25, 'Z'],
    [26, 'AA'],
    [701, 'ZZ'],
    [702, 'AAA'],
  ])('%i → %s', (i, s) => expect(columnLetter(i)).toBe(s))
})

describe('normalizeHeaders', () => {
  it('空列名用列字母命名', () => {
    expect(normalizeHeaders(['工号', '', null, ' 姓名 '])).toEqual(['工号', '列B', '列C', '姓名'])
  })
  it('重名列加序号', () => {
    expect(normalizeHeaders(['姓名', '姓名', '部门', '姓名'])).toEqual(['姓名', '姓名(2)', '部门', '姓名(3)'])
  })
  it('生成的名字不和已有列名冲突', () => {
    expect(normalizeHeaders(['姓名(2)', '姓名', '姓名'])).toEqual(['姓名(2)', '姓名', '姓名(3)'])
  })
})
