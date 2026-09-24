import { create } from 'zustand'

import {
  DEFAULT_NORMALIZE_OPTIONS,
  type CompareResult,
  type NormalizeOptions,
} from '../engine/types'
import type { CsvEncoding } from '../parse/encoding'
import type { FileKind, SheetInfo, TableSummary } from '../parse/types'
import { compareWorker } from '../worker/client'
import {
  applyBulkRole,
  buildFieldRows,
  headersSignature,
  toCompareConfig,
  validateFieldRows,
  type BulkResult,
  type BulkRole,
  type FieldRow,
} from './fields'

export const MIN_FILES = 2
export const MAX_FILES = 3
export const LARGE_FILE_BYTES = 50 * 1024 * 1024

export type Step = 0 | 1 | 2 | 3

/**
 * 保存到云端的任务配置（和原始文件一起上传）。打开时重新解析、重新对比，结果不存。
 * 改结构时升 version，并在 restore 里兼容旧版本。
 */
export interface SavedCompareConfig {
  version: 1
  files: { name: string; sheetName: string; headerRow: number; encodingMode: 'auto' | CsvEncoding }[]
  fieldRows: FieldRow[]
  fieldsSignature: string
  normalize: NormalizeOptions
}

/**
 * 原始文件：解析都在 Worker 里，但保存到云端要上传原件，所以主线程留一份引用（File 本身不占内存）。
 * 不放进 zustand 状态，避免触发渲染。
 */
const originals = new Map<string, File>()

export function getOriginalFile(fileId: string): File | undefined {
  return originals.get(fileId)
}

/** 最近一次批量设置：用于显示结果提示和撤销 */
export interface LastBulk {
  role: BulkRole
  result: Omit<BulkResult, 'rows'>
  prevRows: FieldRow[]
}

export interface SourceFile {
  fileId: string
  name: string
  size: number
  status: 'inspecting' | 'ready' | 'error'
  error?: string
  kind?: FileKind
  sheetNames: string[]
  /** CSV 实际使用的编码 */
  encoding: CsvEncoding | null
  /** CSV 编码设置：自动或手动指定 */
  encodingMode: 'auto' | CsvEncoding
  sheetName: string | null
  headerRow: number | null
  sheetInfo: SheetInfo | null
  sheetLoading: boolean
  sheetError?: string
  table: TableSummary | null
  tableError?: string
}

interface State {
  step: Step
  files: SourceFile[]
  notice: string | null
  fieldRows: FieldRow[]
  fieldsSignature: string
  lastBulk: LastBulk | null
  normalize: NormalizeOptions
  extracting: boolean
  comparing: boolean
  compareError: string | null
  result: CompareResult | null
}

interface Actions {
  /** 返回的 Promise 在所有文件读取完成后 resolve */
  addFiles(files: File[]): Promise<void>
  removeFile(fileId: string): void
  loadSample(rowCount: number, fileCount: 2 | 3): Promise<void>
  setSheet(fileId: string, sheetName: string): Promise<void>
  setHeaderRow(fileId: string, row: number): void
  setEncoding(fileId: string, mode: 'auto' | CsvEncoding): Promise<void>
  dismissNotice(): void
  goTo(step: Step): void
  extractAll(): Promise<boolean>
  updateField(id: string, patch: Partial<Omit<FieldRow, 'id'>>): void
  updateFieldColumn(id: string, fileIndex: number, column: string | null): void
  bulkSetRole(role: BulkRole): void
  undoBulk(): void
  setNormalize(patch: Partial<NormalizeOptions>): void
  runCompare(): Promise<boolean>
  /** 当前任务的配置，用于保存到云端 */
  snapshot(): SavedCompareConfig | null
  /** 用保存的原始文件和配置恢复任务，并直接跑出结果。失败时停在出问题的那一步 */
  restore(files: File[], saved: SavedCompareConfig): Promise<boolean>
  reset(): void
}

const initialState: State = {
  step: 0,
  files: [],
  notice: null,
  fieldRows: [],
  fieldsSignature: '',
  lastBulk: null,
  normalize: DEFAULT_NORMALIZE_OPTIONS,
  extracting: false,
  comparing: false,
  compareError: null,
  result: null,
}

const worker = () => compareWorker.api()

export const useCompareStore = create<State & Actions>()((set, get) => {
  const patchFile = (fileId: string, patch: Partial<SourceFile>) =>
    set((s) => ({ files: s.files.map((f) => (f.fileId === fileId ? { ...f, ...patch } : f)) }))

  const loadSheetInfo = async (fileId: string, sheetName: string) => {
    patchFile(fileId, { sheetName, sheetLoading: true, sheetError: undefined, table: null, tableError: undefined })
    const res = await worker().getSheetInfo(fileId, sheetName)
    if (!get().files.some((f) => f.fileId === fileId)) return
    if (res.ok) {
      patchFile(fileId, {
        sheetInfo: res.value,
        headerRow: res.value.suggestedHeaderRow,
        sheetLoading: false,
      })
    } else {
      patchFile(fileId, { sheetInfo: null, sheetLoading: false, sheetError: res.error.message })
    }
  }

  const inspect = async (fileId: string, file: File) => {
    const res = await worker().inspectFile(fileId, file)
    if (!get().files.some((f) => f.fileId === fileId)) return
    if (!res.ok) {
      patchFile(fileId, { status: 'error', error: res.error.message })
      return
    }
    const info = res.value
    patchFile(fileId, {
      status: 'ready',
      kind: info.kind,
      sheetNames: info.sheetNames,
      encoding: info.encoding,
    })
    const first = info.sheetNames[0]
    if (first) await loadSheetInfo(fileId, first)
  }

  return {
    ...initialState,

    addFiles(incoming) {
      const { files } = get()
      const room = MAX_FILES - files.length
      const accepted = incoming.slice(0, Math.max(0, room))
      const notice =
        incoming.length > accepted.length ? `最多只能对比 ${MAX_FILES} 个文件，多出来的 ${incoming.length - accepted.length} 个没有添加。` : null
      const added: SourceFile[] = accepted.map((file) => ({
        fileId: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        status: 'inspecting',
        sheetNames: [],
        encoding: null,
        encodingMode: 'auto',
        sheetName: null,
        headerRow: null,
        sheetInfo: null,
        sheetLoading: false,
        table: null,
      }))
      added.forEach((f, i) => originals.set(f.fileId, accepted[i]!))
      set({ files: [...files, ...added], notice, result: null })
      return Promise.all(added.map((f, i) => inspect(f.fileId, accepted[i]!))).then(() => {})
    },

    removeFile(fileId) {
      void worker().disposeFile(fileId)
      originals.delete(fileId)
      set((s) => ({ files: s.files.filter((f) => f.fileId !== fileId), notice: null, result: null }))
    },

    async loadSample(rowCount, fileCount) {
      get().reset()
      const samples = await worker().makeSampleFiles(rowCount, fileCount)
      await get().addFiles(samples.map((s) => new File([s.bytes as BlobPart], s.name, { type: s.type })))
    },

    setSheet: (fileId, sheetName) => loadSheetInfo(fileId, sheetName),

    setHeaderRow(fileId, row) {
      patchFile(fileId, { headerRow: row, table: null, tableError: undefined })
    },

    async setEncoding(fileId, mode) {
      patchFile(fileId, { encodingMode: mode, sheetLoading: true })
      const res = await worker().setCsvEncoding(fileId, mode === 'auto' ? null : mode)
      if (!res.ok) {
        patchFile(fileId, { sheetLoading: false, sheetError: res.error.message })
        return
      }
      patchFile(fileId, { encoding: res.value.encoding })
      await loadSheetInfo(fileId, res.value.sheetNames[0]!)
    },

    dismissNotice: () => set({ notice: null }),

    goTo: (step) => set({ step }),

    async extractAll() {
      set({ extracting: true })
      const { files } = get()
      let allOk = true
      for (const f of files) {
        if (!f.sheetName || f.headerRow == null) {
          allOk = false
          continue
        }
        const res = await worker().extractTable(f.fileId, f.sheetName, f.headerRow)
        if (res.ok) patchFile(f.fileId, { table: res.value, tableError: undefined })
        else {
          allOk = false
          patchFile(f.fileId, { table: null, tableError: res.error.message })
        }
      }
      if (allOk) {
        const headers = get().files.map((f) => f.table!.headers)
        const signature = headersSignature(headers)
        if (signature !== get().fieldsSignature) {
          set({ fieldRows: buildFieldRows(headers), fieldsSignature: signature, lastBulk: null })
        }
        set({ step: 2 })
      }
      set({ extracting: false })
      return allOk
    },

    // 逐行修改后，批量设置的提示和撤销失效（避免撤销时覆盖手动改过的内容）
    updateField(id, patch) {
      set((s) => ({
        fieldRows: s.fieldRows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        lastBulk: null,
      }))
    },

    updateFieldColumn(id, fileIndex, column) {
      set((s) => ({
        fieldRows: s.fieldRows.map((r) =>
          r.id === id ? { ...r, columns: r.columns.map((c, i) => (i === fileIndex ? column : c)) } : r,
        ),
        lastBulk: null,
      }))
    },

    bulkSetRole(role) {
      const prevRows = get().fieldRows
      const { rows, ...result } = applyBulkRole(prevRows, role)
      set({ fieldRows: rows, lastBulk: { role, result, prevRows } })
    },

    undoBulk() {
      const { lastBulk } = get()
      if (lastBulk) set({ fieldRows: lastBulk.prevRows, lastBulk: null })
    },

    setNormalize: (patch) => set((s) => ({ normalize: { ...s.normalize, ...patch } })),

    async runCompare() {
      const { files, fieldRows, normalize } = get()
      if (validateFieldRows(fieldRows).errors.length > 0) return false
      set({ comparing: true, compareError: null })
      const config = toCompareConfig(
        files.map((f) => f.fileId),
        fieldRows,
        normalize,
      )
      try {
        const res = await worker().compare(config)
        if (!res.ok) {
          set({ compareError: res.error.message })
          return false
        }
        set({ result: res.value, step: 3 })
        return true
      } catch (e) {
        // Worker 崩溃（通常是内存不够）
        compareWorker.terminate()
        set({ compareError: `对比失败：${e instanceof Error ? e.message : String(e)}。文件可能太大，请重新上传后再试。` })
        return false
      } finally {
        set({ comparing: false })
      }
    },

    snapshot() {
      const { files, fieldRows, fieldsSignature, normalize } = get()
      if (files.some((f) => !f.sheetName || f.headerRow == null)) return null
      return {
        version: 1,
        files: files.map((f) => ({
          name: f.name,
          sheetName: f.sheetName!,
          headerRow: f.headerRow!,
          encodingMode: f.encodingMode,
        })),
        fieldRows,
        fieldsSignature,
        normalize,
      }
    },

    async restore(files, saved) {
      get().reset()
      await get().addFiles(files)
      const current = get().files
      if (current.length !== saved.files.length || current.some((f) => f.status !== 'ready')) return false

      for (const [i, f] of current.entries()) {
        const want = saved.files[i]!
        if (want.encodingMode !== 'auto') await get().setEncoding(f.fileId, want.encodingMode)
        const now = get().files[i]!
        if (now.sheetName !== want.sheetName && now.sheetNames.includes(want.sheetName)) {
          await loadSheetInfo(f.fileId, want.sheetName)
        }
        get().setHeaderRow(f.fileId, want.headerRow)
      }

      set({ step: 1 })
      if (!(await get().extractAll())) return false
      // 表头没变才沿用保存的字段配置；变了就用自动配对的结果，停在字段步骤让用户确认
      if (get().fieldsSignature !== saved.fieldsSignature) return false
      set({ fieldRows: saved.fieldRows, normalize: { ...DEFAULT_NORMALIZE_OPTIONS, ...saved.normalize } })
      return get().runCompare()
    },

    reset() {
      get().files.forEach((f) => void worker().disposeFile(f.fileId))
      originals.clear()
      set({ ...initialState })
    },
  }
})

/** 第 1 步能否继续：2～3 个文件都解析成功 */
export function canLeaveUpload(files: SourceFile[]): boolean {
  return files.length >= MIN_FILES && files.length <= MAX_FILES && files.every((f) => f.status === 'ready')
}

/** 第 2 步能否继续：每个文件都选好了工作表和表头行 */
export function canLeaveSheets(files: SourceFile[]): boolean {
  return files.every((f) => f.sheetInfo && f.headerRow != null && !f.sheetLoading)
}
