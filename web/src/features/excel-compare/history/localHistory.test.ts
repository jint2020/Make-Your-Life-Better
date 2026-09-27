import { describe, expect, it } from 'vitest'

import { pickRecordId } from './localHistory'

describe('pickRecordId：这次对比写到哪条记录', () => {
  const newId = () => 'new'

  it('第一次对比：新建', () => {
    expect(pickRecordId({ current: null, openingId: null }, 'f1|f2', newId)).toBe('new')
  })

  it('同一组文件重新对比：更新同一条', () => {
    expect(pickRecordId({ current: { id: 't1', filesKey: 'f1|f2' }, openingId: null }, 'f1|f2', newId)).toBe('t1')
  })

  it('换了文件：新建', () => {
    expect(pickRecordId({ current: { id: 't1', filesKey: 'f1|f2' }, openingId: null }, 'f1|f3', newId)).toBe('new')
  })

  it('从历史打开的任务：更新原来那条（恢复后文件 id 是新的也一样）', () => {
    expect(pickRecordId({ current: { id: 't1', filesKey: 'f1|f2' }, openingId: 't0' }, 'g1|g2', newId)).toBe('t0')
  })
})
