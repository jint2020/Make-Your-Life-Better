import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

/**
 * 本地任务存储（IndexedDB）。
 *
 * - 一个"任务"= 一次工具使用的配置 + 若干附件（原始文件、解析后的列式数据）
 * - 结果不存：打开任务时重新计算，保证结果和配置对得上
 * - IndexedDB 不可用时（无痕模式、被禁用、空间满）自动降级为内存存储，persistent = false
 */

export interface TaskRecord<TConfig = unknown> {
  id: string
  toolId: string
  title: string
  createdAt: number
  updatedAt: number
  config: TConfig
  attachmentIds: string[]
  /** 附件总字节数，用于显示占用空间 */
  sizeBytes: number
}

export interface AttachmentRecord {
  id: string
  taskId: string
  kind: 'file' | 'parsed'
  name: string
  size: number
  data: Blob | ArrayBuffer | unknown
}

export interface RetentionPolicy {
  maxCount: number
  maxAgeDays: number
}

export const DEFAULT_RETENTION: RetentionPolicy = { maxCount: 10, maxAgeDays: 30 }

interface MylbDB extends DBSchema {
  tasks: {
    key: string
    value: TaskRecord
    indexes: { byTool: string; byUpdatedAt: number }
  }
  attachments: {
    key: string
    value: AttachmentRecord
    indexes: { byTask: string }
  }
}

const DB_NAME = 'mylb'
const DB_VERSION = 1

export interface TaskStore<TConfig> {
  readonly persistent: boolean
  list(): Promise<TaskRecord<TConfig>[]>
  get(id: string): Promise<{ task: TaskRecord<TConfig>; attachments: AttachmentRecord[] } | undefined>
  save(task: TaskRecord<TConfig>, attachments: AttachmentRecord[]): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
  /** 按保留策略清理，返回被删除的任务 id */
  prune(policy?: RetentionPolicy, now?: number): Promise<string[]>
  usageBytes(): Promise<number>
}

/** 超出保留策略、需要删除的任务 id（纯函数，方便单测） */
export function selectExpired(
  tasks: Pick<TaskRecord, 'id' | 'updatedAt'>[],
  policy: RetentionPolicy,
  now: number,
): string[] {
  const maxAgeMs = policy.maxAgeDays * 24 * 60 * 60 * 1000
  const sorted = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt)
  return sorted.filter((t, i) => i >= policy.maxCount || now - t.updatedAt > maxAgeMs).map((t) => t.id)
}

function openMylbDB(): Promise<IDBPDatabase<MylbDB>> {
  return openDB<MylbDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const tasks = db.createObjectStore('tasks', { keyPath: 'id' })
      tasks.createIndex('byTool', 'toolId')
      tasks.createIndex('byUpdatedAt', 'updatedAt')
      const att = db.createObjectStore('attachments', { keyPath: 'id' })
      att.createIndex('byTask', 'taskId')
    },
  })
}

function createIdbStore<TConfig>(db: IDBPDatabase<MylbDB>, toolId: string): TaskStore<TConfig> {
  const store: TaskStore<TConfig> = {
    persistent: true,

    async list() {
      const all = await db.getAllFromIndex('tasks', 'byTool', toolId)
      return (all as TaskRecord<TConfig>[]).sort((a, b) => b.updatedAt - a.updatedAt)
    },

    async get(id) {
      const task = (await db.get('tasks', id)) as TaskRecord<TConfig> | undefined
      if (!task || task.toolId !== toolId) return undefined
      const attachments = await db.getAllFromIndex('attachments', 'byTask', id)
      return { task, attachments }
    },

    async save(task, attachments) {
      const tx = db.transaction(['tasks', 'attachments'], 'readwrite')
      const attStore = tx.objectStore('attachments')
      const oldKeys = await attStore.index('byTask').getAllKeys(task.id)
      await Promise.all(oldKeys.map((k) => attStore.delete(k)))
      await Promise.all(attachments.map((a) => attStore.put(a)))
      await tx.objectStore('tasks').put({ ...task, toolId } as TaskRecord)
      await tx.done
    },

    async remove(id) {
      const tx = db.transaction(['tasks', 'attachments'], 'readwrite')
      const attStore = tx.objectStore('attachments')
      const keys = await attStore.index('byTask').getAllKeys(id)
      await Promise.all(keys.map((k) => attStore.delete(k)))
      await tx.objectStore('tasks').delete(id)
      await tx.done
    },

    async clear() {
      const tasks = await store.list()
      for (const t of tasks) await store.remove(t.id)
    },

    async prune(policy = DEFAULT_RETENTION, now = Date.now()) {
      const expired = selectExpired(await store.list(), policy, now)
      for (const id of expired) await store.remove(id)
      return expired
    },

    async usageBytes() {
      const tasks = await store.list()
      return tasks.reduce((sum, t) => sum + t.sizeBytes, 0)
    },
  }
  return store
}

function createMemoryStore<TConfig>(toolId: string): TaskStore<TConfig> {
  const tasks = new Map<string, TaskRecord<TConfig>>()
  const atts = new Map<string, AttachmentRecord[]>()
  const store: TaskStore<TConfig> = {
    persistent: false,
    async list() {
      return [...tasks.values()].sort((a, b) => b.updatedAt - a.updatedAt)
    },
    async get(id) {
      const task = tasks.get(id)
      return task ? { task, attachments: atts.get(id) ?? [] } : undefined
    },
    async save(task, attachments) {
      tasks.set(task.id, { ...task, toolId })
      atts.set(task.id, attachments)
    },
    async remove(id) {
      tasks.delete(id)
      atts.delete(id)
    },
    async clear() {
      tasks.clear()
      atts.clear()
    },
    async prune(policy = DEFAULT_RETENTION, now = Date.now()) {
      const expired = selectExpired([...tasks.values()], policy, now)
      expired.forEach((id) => void store.remove(id))
      return expired
    },
    async usageBytes() {
      return [...tasks.values()].reduce((s, t) => s + t.sizeBytes, 0)
    },
  }
  return store
}

let dbPromise: Promise<IDBPDatabase<MylbDB> | null> | null = null

function getDB(): Promise<IDBPDatabase<MylbDB> | null> {
  dbPromise ??= openMylbDB().catch(() => null)
  return dbPromise
}

/** 获取某个工具的任务存储；IndexedDB 不可用时返回内存实现 */
export async function getTaskStore<TConfig>(toolId: string): Promise<TaskStore<TConfig>> {
  if (typeof indexedDB === 'undefined') return createMemoryStore<TConfig>(toolId)
  const db = await getDB()
  return db ? createIdbStore<TConfig>(db, toolId) : createMemoryStore<TConfig>(toolId)
}

/** 仅测试用：重置缓存的数据库连接 */
export function __resetTaskStoreForTests(): void {
  dbPromise = null
}

/** 浏览器给整个站点的配额估算（不一定所有浏览器都支持） */
export async function estimateQuota(): Promise<{ usage: number; quota: number } | null> {
  try {
    const est = await navigator.storage?.estimate?.()
    return est ? { usage: est.usage ?? 0, quota: est.quota ?? 0 } : null
  } catch {
    return null
  }
}
