import { describe, expect, it } from 'vitest'

import { computeTextCounts, formatCharCount, formatTokenCount } from './counts'

describe('computeTextCounts', () => {
  it('空字符串', () => {
    expect(computeTextCounts('')).toEqual({ charCount: 0, tokenCount: 0 })
  })

  it('纯 ASCII：每 4 个字符算 1 个 Token，向上取整', () => {
    expect(computeTextCounts('abcd')).toEqual({ charCount: 4, tokenCount: 1 })
    expect(computeTextCounts('abcde')).toEqual({ charCount: 5, tokenCount: 2 })
  })

  it('纯汉字：每个字算 1 个 Token', () => {
    expect(computeTextCounts('中文测试')).toEqual({ charCount: 4, tokenCount: 4 })
  })

  it('假名、韩文、CJK 标点、全角字符也按 1 个算', () => {
    expect(computeTextCounts('ひらがな')).toEqual({ charCount: 4, tokenCount: 4 })
    expect(computeTextCounts('한국어')).toEqual({ charCount: 3, tokenCount: 3 })
    expect(computeTextCounts('，。')).toEqual({ charCount: 2, tokenCount: 2 })
    expect(computeTextCounts('Ａ１')).toEqual({ charCount: 2, tokenCount: 2 })
  })

  it('混合：中文按 1 个，其余按 4 个算 1 个后相加', () => {
    // 中文 2 个 -> 2 token；其余 3 个 -> ceil(3/4)=1 token；合计 3
    expect(computeTextCounts('中文abc')).toEqual({ charCount: 5, tokenCount: 3 })
  })

  it('增补平面的生僻字（代理对）只算一个码点', () => {
    const rare = String.fromCodePoint(0x20000)
    expect(rare).toHaveLength(2) // UTF-16 下是两个 code unit
    expect(computeTextCounts(rare)).toEqual({ charCount: 1, tokenCount: 1 })
    expect(computeTextCounts(`${rare}${rare}`)).toEqual({ charCount: 2, tokenCount: 2 })
  })

  it('emoji（代理对，非 CJK）按其余字符处理', () => {
    const emoji = '😀' // U+1F600，代理对，不在任何 CJK 区间
    expect(computeTextCounts(emoji)).toEqual({ charCount: 1, tokenCount: 1 })
  })

  it('孤立的代理项不会导致死循环或报错', () => {
    const lonelyHigh = '\uD800a'
    expect(() => computeTextCounts(lonelyHigh)).not.toThrow()
    expect(computeTextCounts(lonelyHigh).charCount).toBe(2)
  })
})

describe('formatCharCount', () => {
  it('千分位分隔', () => {
    expect(formatCharCount(0)).toBe('0 字符')
    expect(formatCharCount(12345)).toBe('12,345 字符')
  })
})

describe('formatTokenCount', () => {
  it('100 以内精确显示', () => {
    expect(formatTokenCount(0)).toBe('约 0 Token')
    expect(formatTokenCount(42)).toBe('约 42 Token')
    expect(formatTokenCount(99)).toBe('约 99 Token')
  })

  it('100 到 1 万之间四舍五入到百位，带千分位', () => {
    expect(formatTokenCount(100)).toBe('约 100 Token')
    expect(formatTokenCount(149)).toBe('约 100 Token')
    expect(formatTokenCount(150)).toBe('约 200 Token')
    expect(formatTokenCount(4567)).toBe('约 4,600 Token')
  })

  it('1 万以上显示"约 X 万"，去掉多余的 .0', () => {
    expect(formatTokenCount(10_000)).toBe('约 1 万 Token')
    expect(formatTokenCount(20_000)).toBe('约 2 万 Token')
    expect(formatTokenCount(12_345)).toBe('约 1.2 万 Token')
    expect(formatTokenCount(123_456)).toBe('约 12.3 万 Token')
  })
})
