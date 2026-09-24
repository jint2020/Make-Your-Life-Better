import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  __resetTaskStoreForTests,
  getTaskStore,
  selectExpired,
  type TaskRecord,
} from './taskStore'

const DAY = 24 * 60 * 60 * 1000

function task(id: string, updatedAt: number): TaskRecord<{ n: number }> {
  return {
    id,
    toolId: 'test',
    title: id,
    createdAt: updatedAt,
    updatedAt,
    config: { n: 1 },
    attachmentIds: [],
    sizeBytes: 100,
  }
}

describe('selectExpired', () => {
  it('超过数量上限时删除最旧的', () => {
    const now = 100 * DAY
    const tasks = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, updatedAt: now - i * 1000 }))
    expect(selectExpired(tasks, { maxCount: 10, maxAgeDays: 30 }, now)).toEqual(['t10', 't11'])
  })

  it('超过天数的删除', () => {
    const now = 100 * DAY
    const tasks = [
      { id: 'fresh', updatedAt: now - 29 * DAY },
      { id: 'old', updatedAt: now - 31 * DAY },
    ]
    expect(selectExpired(tasks, { maxCount: 10, maxAgeDays: 30 }, now)).toEqual(['old'])
  })
})

describe('TaskStore (IndexedDB)', () => {
  beforeEach(async () => {
    __resetTaskStoreForTests()
    const store = await getTaskStore('test')
    await store.clear()
  })

  it('保存、读取、删除任务及附件', async () => {
    const store = await getTaskStore<{ n: number }>('test')
    expect(store.persistent).toBe(true)

    await store.save(task('a', 1), [
      { id: 'a-f1', taskId: 'a', kind: 'file', name: 'x.csv', size: 3, data: new Uint8Array([1, 2, 3]).buffer },
    ])
    const got = await store.get('a')
    expect(got?.task.title).toBe('a')
    expect(got?.attachments).toHaveLength(1)

    await store.remove('a')
    expect(await store.get('a')).toBeUndefined()
    expect(await store.list()).toHaveLength(0)
  })

  it('不同工具之间互不可见', async () => {
    const a = await getTaskStore('test')
    const b = await getTaskStore('other')
    await a.save(task('only-a', 1), [])
    expect(await b.list()).toHaveLength(0)
    expect(await b.get('only-a')).toBeUndefined()
  })

  it('prune 按策略清理并返回被删除的 id', async () => {
    const store = await getTaskStore<{ n: number }>('test')
    const now = 100 * DAY
    await store.save(task('new', now), [])
    await store.save(task('old', now - 40 * DAY), [])
    expect(await store.prune(undefined, now)).toEqual(['old'])
    expect((await store.list()).map((t) => t.id)).toEqual(['new'])
  })
})
