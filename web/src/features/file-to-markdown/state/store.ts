import { create } from 'zustand'

import { formatSize } from '@/lib/format'
import { convertFile, type ConvertWarning } from '../api'
import { t } from '../copy'
import { computeTextCounts } from './counts'
import { MAX_FILES, nextQueued, selectionAfterRemove } from './queue'
import { validateFile, type FileRejection } from './validate'

export type ItemStatus = 'queued' | 'converting' | 'done' | 'failed'

export interface ConvertItem {
  id: string
  name: string
  size: number
  status: ItemStatus
  warnings: ConvertWarning[]
  markdown: string | null
  charCount: number | null
  tokenCount: number | null
  error: string | null
}

/** 结果超过这个字符数就只预览前面这些；复制和下载仍然是完整内容 */
export const PREVIEW_LIMIT = 200_000

/**
 * 原始 File 对象和进行中请求的 AbortController，不放进 zustand 状态：
 * 一是没必要触发渲染，二是重试要复用同一个 File。
 */
const files = new Map<string, File>()
const controllers = new Map<string, AbortController>()

function rejectionMessage(reason: FileRejection, size: number): string {
  switch (reason.kind) {
    case 'resave':
      return t.reject.resave(reason.ext, reason.suggestion)
    case 'unsupported':
      return t.reject.unsupported
    case 'too-large':
      return t.reject.tooLarge(formatSize(size))
  }
}

interface State {
  items: ConvertItem[]
  /** 右侧主区域显示哪一个文件的结果 */
  selectedId: string | null
  /** 一次性提示：目前只有"这次超过了 10 个文件" */
  notice: string | null
}

interface Actions {
  addFiles(incoming: File[]): void
  removeItem(id: string): void
  retryItem(id: string): void
  select(id: string): void
  dismissNotice(): void
}

export const useFileToMarkdownStore = create<State & Actions>()((set, get) => ({
  items: [],
  selectedId: null,
  notice: null,

  addFiles(incoming) {
    const { items } = get()
    const room = Math.max(0, MAX_FILES - items.length)
    const accepted = incoming.slice(0, room)
    const overflow = incoming.length - accepted.length
    const notice = overflow > 0 ? t.reject.tooMany(overflow) : null

    const added: ConvertItem[] = accepted.map((file) => {
      const id = crypto.randomUUID()
      files.set(id, file)
      const rejection = validateFile(file)
      return {
        id,
        name: file.name,
        size: file.size,
        status: rejection ? 'failed' : 'queued',
        warnings: [],
        markdown: null,
        charCount: null,
        tokenCount: null,
        error: rejection ? rejectionMessage(rejection, file.size) : null,
      }
    })

    set((s) => ({
      items: [...s.items, ...added],
      notice,
      selectedId: s.selectedId ?? added[0]?.id ?? null,
    }))
    processQueue()
  },

  removeItem(id) {
    controllers.get(id)?.abort()
    controllers.delete(id)
    files.delete(id)
    set((s) => {
      const items = s.items.filter((i) => i.id !== id)
      return { items, notice: null, selectedId: selectionAfterRemove(items, id, s.selectedId) }
    })
  },

  retryItem(id) {
    const item = get().items.find((i) => i.id === id)
    const file = files.get(id)
    if (!item || !file || item.status !== 'failed') return
    const rejection = validateFile(file)
    if (rejection) {
      patchItem(id, { status: 'failed', error: rejectionMessage(rejection, file.size) })
      return
    }
    patchItem(id, { status: 'queued', error: null, markdown: null, warnings: [], charCount: null, tokenCount: null })
    processQueue()
  },

  select: (id) => set({ selectedId: id }),

  dismissNotice: () => set({ notice: null }),
}))

function patchItem(id: string, patch: Partial<ConvertItem>): void {
  useFileToMarkdownStore.setState((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
}

// ---- 队列处理：一个一个转，不并发 ----

let processing = false

function processQueue(): void {
  if (processing) return
  processing = true
  void (async () => {
    try {
      for (;;) {
        const next = nextQueued(useFileToMarkdownStore.getState().items)
        if (!next) break
        await runItem(next.id)
      }
    } finally {
      processing = false
    }
  })()
}

/** 仅测试用：重置队列处理标志和内存里的 File / AbortController 缓存 */
export function __resetFileToMarkdownForTests(): void {
  processing = false
  files.clear()
  controllers.clear()
}

async function runItem(id: string): Promise<void> {
  const file = files.get(id)
  if (!file) return
  const controller = new AbortController()
  controllers.set(id, controller)
  patchItem(id, { status: 'converting', error: null })

  const res = await convertFile(file, controller.signal)
  controllers.delete(id)
  // 转换过程中可能已经被移除了
  if (!useFileToMarkdownStore.getState().items.some((i) => i.id === id)) return

  if (res.ok) {
    const { charCount, tokenCount } = computeTextCounts(res.value.markdown)
    patchItem(id, {
      status: 'done',
      markdown: res.value.markdown,
      warnings: res.value.warnings,
      charCount,
      tokenCount,
      error: null,
    })
  } else {
    patchItem(id, { status: 'failed', error: res.message })
  }
}

// ---- 离开页面前的确认：只要还有转换完成的结果就提示 ----

let lifecycleStarted = false

/**
 * 注册离开页面前的确认提示。只调用一次；即使之后切到别的工具，提示仍然生效
 * （和 excel-compare 的 startLocalHistory 是同一个模式：在 store 模块级别注册，不跟着页面组件卸载）。
 */
export function startFileToMarkdown(): void {
  if (lifecycleStarted) return
  lifecycleStarted = true
  window.addEventListener('beforeunload', (e) => {
    if (!useFileToMarkdownStore.getState().items.some((i) => i.status === 'done')) return
    e.preventDefault()
    e.returnValue = ''
  })
}
