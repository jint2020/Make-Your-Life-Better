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
  buildFieldRows,
  headersSignature,
  toCompareConfig,
  validateFieldRows,
  type FieldRow,
} from './fields'

export const MIN_FILES = 2
export const MAX_FILES = 3
export const LARGE_FILE_BYTES = 50 * 1024 * 1024

export type Step = 0 | 1 | 2 | 3

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
  normalize: NormalizeOptions
  extracting: boolean
  comparing: boolean
  compareError: string | null
  result: CompareResult | null
}

interface Actions {
  addFiles(files: File[]): void
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
  setNormalize(patch: Partial<NormalizeOptions>): void
  runCompare(): Promise<boolean>
  reset(): void
}

const initialState: State = {
  step: 0,
  files: [],
  notice: null,
  fieldRows: [],
  fieldsSignature: '',
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
      set({ files: [...files, ...added], notice, result: null })
      added.forEach((f, i) => void inspect(f.fileId, accepted[i]!))
    },

    removeFile(fileId) {
      void worker().disposeFile(fileId)
      set((s) => ({ files: s.files.filter((f) => f.fileId !== fileId), notice: null, result: null }))
    },

    async loadSample(rowCount, fileCount) {
      get().files.forEach((f) => void worker().disposeFile(f.fileId))
      set({ ...initialState })
      const samples = await worker().makeSampleFiles(rowCount, fileCount)
      get().addFiles(samples.map((s) => new File([s.bytes as BlobPart], s.name, { type: s.type })))
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
          set({ fieldRows: buildFieldRows(headers), fieldsSignature: signature })
        }
        set({ step: 2 })
      }
      set({ extracting: false })
      return allOk
    },

    updateField(id, patch) {
      set((s) => ({ fieldRows: s.fieldRows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
    },

    updateFieldColumn(id, fileIndex, column) {
      set((s) => ({
        fieldRows: s.fieldRows.map((r) =>
          r.id === id ? { ...r, columns: r.columns.map((c, i) => (i === fileIndex ? column : c)) } : r,
        ),
      }))
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

    reset() {
      get().files.forEach((f) => void worker().disposeFile(f.fileId))
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
