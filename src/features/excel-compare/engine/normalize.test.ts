import { describe, expect, it } from 'vitest'

import { buildKey, normalizeValue as n, toHalfWidth } from './normalize'
import { DEFAULT_NORMALIZE_OPTIONS as D, type NormalizeOptions } from './types'

const opts = (o: Partial<NormalizeOptions> = {}): NormalizeOptions => ({ ...D, ...o })
const same = (a: Parameters<typeof n>[0], b: Parameters<typeof n>[0], o = opts()) =>
  n(a, o) === n(b, o)

describe('空值', () => {
  it.each([null, undefined, '', '   ', 'null', 'NULL', '　'])('%j 视为空', (v) => {
    expect(n(v, opts())).toBe('')
  })
})

describe('空白', () => {
  it('去掉首尾空格、全角空格和不换行空格', () => {
    expect(same(' 张三 ', '张三')).toBe(true)
    expect(same('　张三 ', '张三')).toBe(true)
  })
  it('中间空格保留', () => {
    expect(same('张 三', '张三')).toBe(false)
  })
})

describe('数字', () => {
  it('数字和文本型数字按数值比较', () => {
    expect(same(1, '1')).toBe(true)
    expect(same(1, '1.0')).toBe(true)
    expect(same(1000, '1,000')).toBe(true)
    expect(same(-3.5, '-3.50')).toBe(true)
    expect(same(0.5, '.5')).toBe(true)
  })
  it('消除浮点噪声', () => {
    expect(same(0.1 + 0.2, 0.3)).toBe(true)
  })
  it('默认保留前导零：001 ≠ 1', () => {
    expect(same('001', '1')).toBe(false)
    expect(same('001', 1)).toBe(false)
    expect(same('0.5', 0.5)).toBe(true)
    expect(same('0', 0)).toBe(true)
  })
  it('关闭保留前导零：001 = 1', () => {
    expect(same('001', '1', opts({ keepLeadingZeros: false }))).toBe(true)
  })
  it('超过 15 位的数字串按文本比（身份证号）', () => {
    expect(same('440600199001011234', '440600199001011235')).toBe(false)
    expect(n('440600199001011234', opts())).toBe('440600199001011234')
  })
})

describe('日期', () => {
  it('Date 与各种日期字符串统一为 YYYY-MM-DD', () => {
    const d = new Date(2024, 0, 5)
    expect(n(d, opts())).toBe('2024-01-05')
    for (const s of ['2024-01-05', '2024/1/5', '2024.01.05', '2024年1月5日', '2024-01-05 00:00:00']) {
      expect(n(s, opts())).toBe('2024-01-05')
    }
  })
  it('带非零时间的不当作纯日期', () => {
    expect(n('2024-01-05 08:30', opts())).toBe('2024-01-05 08:30')
  })
})

describe('开关', () => {
  it('忽略大小写', () => {
    expect(same('ABC', 'abc')).toBe(false)
    expect(same('ABC', 'abc', opts({ ignoreCase: true }))).toBe(true)
  })
  it('全角转半角', () => {
    expect(toHalfWidth('Ａ１２３，')).toBe('A123,')
    expect(same('Ａ1', 'A1')).toBe(false)
    expect(same('Ａ1', 'A1', opts({ fullToHalf: true }))).toBe(true)
    expect(same('１２３', 123, opts({ fullToHalf: true }))).toBe(true)
  })
})

describe('buildKey', () => {
  it('组合主键各部分归一化后拼接', () => {
    expect(buildKey([' 张三', '001'], opts())).toBe(buildKey(['张三', '001'], opts()))
    expect(buildKey(['张三', '001'], opts())).not.toBe(buildKey(['张三0', '01'], opts()))
  })
  it('任一部分为空则主键为空', () => {
    expect(buildKey(['张三', ''], opts())).toBeNull()
    expect(buildKey([null], opts())).toBeNull()
  })
})
