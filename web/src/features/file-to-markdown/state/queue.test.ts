import { describe, expect, it } from 'vitest'

import { markdownFileName, nextQueued, selectionAfterRemove, splitByRoom } from './queue'

describe('splitByRoom', () => {
  it('放得下：全部接受，没有溢出', () => {
    expect(splitByRoom([1, 2], 0, 10)).toEqual({ accepted: [1, 2], overflow: 0 })
  })

  it('放不下全部：接受能放下的部分，其余算溢出', () => {
    expect(splitByRoom([1, 2, 3], 8, 10)).toEqual({ accepted: [1, 2], overflow: 1 })
  })

  it('已经满了：全部溢出', () => {
    expect(splitByRoom([1, 2], 10, 10)).toEqual({ accepted: [], overflow: 2 })
  })

  it('当前数量超过上限（不应该发生，但不能崩）：不接受负数空间', () => {
    expect(splitByRoom([1], 12, 10)).toEqual({ accepted: [], overflow: 1 })
  })
})

describe('selectionAfterRemove', () => {
  const items = [{ id: 'b' }, { id: 'c' }]

  it('移除的不是当前选中的：选中不变', () => {
    expect(selectionAfterRemove(items, 'a', 'b')).toBe('b')
  })

  it('移除的正是当前选中的：换成剩下的第一个', () => {
    expect(selectionAfterRemove(items, 'a', 'a')).toBe('b')
  })

  it('移除后列表空了：没有选中', () => {
    expect(selectionAfterRemove([], 'a', 'a')).toBeNull()
  })
})

describe('nextQueued', () => {
  it('找到第一个排队中的', () => {
    const items = [{ status: 'done' }, { status: 'queued', id: 1 }, { status: 'queued', id: 2 }]
    expect(nextQueued(items)).toEqual({ status: 'queued', id: 1 })
  })

  it('没有排队中的：undefined', () => {
    expect(nextQueued([{ status: 'done' }, { status: 'failed' }])).toBeUndefined()
  })
})

describe('markdownFileName', () => {
  it('替换扩展名', () => {
    expect(markdownFileName('report.pdf')).toBe('report.md')
  })
  it('保留中文文件名', () => {
    expect(markdownFileName('读书笔记.docx')).toBe('读书笔记.md')
  })
  it('多个点：只去掉最后一段', () => {
    expect(markdownFileName('a.b.pptx')).toBe('a.b.md')
  })
  it('没有扩展名：直接加 .md', () => {
    expect(markdownFileName('noext')).toBe('noext.md')
  })
})
