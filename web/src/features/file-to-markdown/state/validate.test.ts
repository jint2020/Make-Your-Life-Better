import { describe, expect, it } from 'vitest'

import { getExtension, MAX_FILE_BYTES, validateFile } from './validate'

describe('getExtension', () => {
  it('正常提取，转小写', () => {
    expect(getExtension('报告.PDF')).toBe('.pdf')
    expect(getExtension('a.b.docx')).toBe('.docx')
  })
  it('没有扩展名或以点开头的隐藏文件：没有扩展名', () => {
    expect(getExtension('noext')).toBe('')
    expect(getExtension('.hidden')).toBe('')
  })
})

describe('validateFile', () => {
  const ok = (name: string, size = 1024) => expect(validateFile({ name, size })).toBeNull()

  it('支持的格式都能通过', () => {
    for (const ext of ['.pdf', '.docx', '.pptx', '.xlsx', '.csv', '.html', '.htm', '.epub']) {
      ok(`文件${ext}`)
    }
  })

  it('大小写不敏感', () => {
    ok('报告.PDF')
  })

  it('.doc / .ppt / .xls 提示另存为新格式', () => {
    expect(validateFile({ name: 'a.doc', size: 1 })).toEqual({ kind: 'resave', ext: '.doc', suggestion: '.docx' })
    expect(validateFile({ name: 'a.ppt', size: 1 })).toEqual({ kind: 'resave', ext: '.ppt', suggestion: '.pptx' })
    expect(validateFile({ name: 'a.xls', size: 1 })).toEqual({ kind: 'resave', ext: '.xls', suggestion: '.xlsx' })
  })

  it('图片、压缩包、无扩展名等：不支持', () => {
    for (const name of ['照片.png', '压缩包.zip', '没有扩展名', '备忘录.txt']) {
      expect(validateFile({ name, size: 1 })).toEqual({ kind: 'unsupported' })
    }
  })

  it('超过 20MB：太大', () => {
    expect(validateFile({ name: 'a.pdf', size: MAX_FILE_BYTES + 1 })).toEqual({ kind: 'too-large' })
  })

  it('刚好 20MB：允许', () => {
    ok('a.pdf', MAX_FILE_BYTES)
  })
})
