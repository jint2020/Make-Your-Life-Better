import { create } from 'zustand'

import {
  DEFAULT_RETENTION,
  getTaskStore,
  type AttachmentRecord,
  type TaskRecord,
  type TaskStore,
} from '@/shared/storage/taskStore'
import { isSavedConfig, taskTitle, TOOL_ID } from '../cloud/cloud'
import { t } from '../copy'
import { getOriginalFile, useCompareStore, type SavedCompareConfig, type SourceFile } from '../state/store'

/**
 * 本机历史：每次对比成功后自动把原始文件和配置存进 IndexedDB（和云端保存同一套格式）。
 * 打开时和打开云端任务一样，走 store.restore() 重新解析、重新对比。
 */

export type LocalTask = TaskRecord<SavedCompareConfig>

type Outcome = { ok: true } | { ok: false; message: string }

interface HistoryState {
  ready: boolean
  /** false：IndexedDB 不可用（无痕模式等），只存在内存里，关掉页面就没了 */
  persistent: boolean
  tasks: LocalTask[]
  error: string | null
  refresh(): Promise<void>
}

const openStore = (): Promise<TaskStore<SavedCompareConfig>> => getTaskStore<SavedCompareConfig>(TOOL_ID)

export const useLocalHistory = create<HistoryState>()((set) => ({
  ready: false,
  persistent: true,
  tasks: [],
  error: null,
  async refresh() {
    const store = await openStore()
    set({ ready: true, persistent: store.persistent, tasks: await store.list() })
  },
}))

// ---- 当前这次对比对应哪条记录 ----

/** 同一组文件反复对比时更新同一条记录；换了文件（fileId 变了）才新建 */
let current: { id: string; filesKey: string } | null = null
/** 从历史打开的任务：恢复后的那次对比要更新原来那条记录，而不是新建 */
let openingId: string | null = null
/** 恢复过程中 store 会先 reset，这时不能把上面两个状态清掉 */
let restoring = false

const filesKey = (files: SourceFile[]) => files.map((f) => f.fileId).join('|')

/** 决定这次保存写到哪条记录（纯函数，方便单测） */
export function pickRecordId(
  state: { current: { id: string; filesKey: string } | null; openingId: string | null },
  key: string,
  newId: () => string,
): string {
  if (state.openingId) return state.openingId
  if (state.current && state.current.filesKey === key) return state.current.id
  return newId()
}

async function saveCurrent(): Promise<void> {
  const state = useCompareStore.getState()
  const config = state.snapshot()
  const files = state.files.map((f) => getOriginalFile(f.fileId))
  if (!config || files.some((f) => !f)) return

  const key = filesKey(state.files)
  const id = pickRecordId({ current, openingId }, key, () => crypto.randomUUID())
  openingId = null
  current = { id, filesKey: key }

  const originals = files as File[]
  const attachments: AttachmentRecord[] = originals.map((file, i) => ({
    id: `${id}:${i}`,
    taskId: id,
    kind: 'file',
    name: file.name,
    size: file.size,
    // File 本身就是 Blob，IndexedDB 可以直接存，不用先读成 ArrayBuffer
    data: file,
  }))
  const now = Date.now()
  try {
    const store = await openStore()
    const existing = await store.get(id)
    await store.save(
      {
        id,
        toolId: TOOL_ID,
        title: taskTitle(originals.map((f) => f.name)),
        createdAt: existing?.task.createdAt ?? now,
        updatedAt: now,
        config,
        attachmentIds: attachments.map((a) => a.id),
        sizeBytes: originals.reduce((sum, f) => sum + f.size, 0),
      },
      attachments,
    )
    await store.prune(DEFAULT_RETENTION, now)
    useLocalHistory.setState({ error: null })
  } catch {
    // 通常是空间满了：不影响这次对比，只提示没保存上
    useLocalHistory.setState({ error: t.history.saveFailed })
  }
  await useLocalHistory.getState().refresh()
}

let started = false

/** 开始自动保存（进入 Excel 对比页时调用一次，重复调用无副作用） */
export function startLocalHistory(): void {
  if (started) return
  started = true
  useCompareStore.subscribe((s, prev) => {
    // 每次出了新结果（第一次对比、重新对比、从历史或云端打开）就保存
    if (s.result && s.result !== prev.result) void saveCurrent()
    // 用户点了"重新开始"：下一次对比是新任务
    if (s.files.length === 0 && prev.files.length > 0 && !restoring) {
      current = null
      openingId = null
    }
  })
  void (async () => {
    const store = await openStore()
    await store.prune(DEFAULT_RETENTION)
    await useLocalHistory.getState().refresh()
  })()
}

export async function openLocalTask(id: string): Promise<Outcome> {
  const store = await openStore()
  const found = await store.get(id)
  if (!found || !isSavedConfig(found.task.config)) return { ok: false, message: t.history.openFailed }

  const byId = new Map(found.attachments.map((a) => [a.id, a]))
  const files = found.task.attachmentIds.map((attId) => {
    const a = byId.get(attId)
    if (!a || !(a.data instanceof Blob)) return null
    return a.data instanceof File ? a.data : new File([a.data], a.name)
  })
  if (files.some((f) => !f)) return { ok: false, message: t.history.openFailed }

  restoring = true
  openingId = id
  try {
    const done = await useCompareStore.getState().restore(files as File[], found.task.config)
    return done ? { ok: true } : { ok: false, message: t.history.restoreStopped }
  } finally {
    restoring = false
  }
}

export async function deleteLocalTask(id: string): Promise<void> {
  const store = await openStore()
  await store.remove(id)
  if (current?.id === id) current = null
  await useLocalHistory.getState().refresh()
}

export async function clearLocalHistory(): Promise<void> {
  const store = await openStore()
  await store.clear()
  current = null
  await useLocalHistory.getState().refresh()
}
