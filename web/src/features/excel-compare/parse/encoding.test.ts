import { describe, expect, it } from 'vitest'

import { decodeCsvBytes } from './encoding'

// "工号,姓名" 的 GBK 编码
const GBK_BYTES = new Uint8Array([0xb9, 0xa4, 0xba, 0xc5, 0x2c, 0xd0, 0xd5, 0xc3, 0xfb])

describe('decodeCsvBytes', () => {
  it('UTF-8 正常识别', () => {
    const r = decodeCsvBytes(new TextEncoder().encode('工号,姓名'))
    expect(r).toEqual({ text: '工号,姓名', encoding: 'utf-8' })
  })
  it('去掉 UTF-8 BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('a,b')])
    expect(decodeCsvBytes(bytes).text).toBe('a,b')
  })
  it('GBK 自动回退到 GB18030', () => {
    expect(decodeCsvBytes(GBK_BYTES)).toEqual({ text: '工号,姓名', encoding: 'gb18030' })
  })
  it('可以强制指定编码', () => {
    expect(decodeCsvBytes(GBK_BYTES, 'gb18030').text).toBe('工号,姓名')
  })
})
