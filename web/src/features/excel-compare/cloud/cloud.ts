import { api, errorMessage, type CloudTaskSummary } from '@/shared/api/client'
import { t } from '../copy'
import { getOriginalFile, useCompareStore, type SavedCompareConfig } from '../state/store'

export const TOOL_ID = 'excel-compare'

type Outcome = { ok: true } | { ok: false; message: string }

/** 上传当前任务的原始文件和配置 */
export async function saveCurrentTask(): Promise<Outcome> {
  const state = useCompareStore.getState()
  const config = state.snapshot()
  const files = state.files.map((f) => getOriginalFile(f.fileId))
  if (!config || files.some((f) => !f)) return { ok: false, message: t.cloud.notReady }

  const { error, response } = await api.POST('/api/cloud/tasks', {
    body: {
      tool_id: TOOL_ID,
      name: state.files.map((f) => f.name).join(' · ').slice(0, 200),
      config: JSON.stringify(config),
      files: files as unknown as string[],
    },
    // openapi-fetch 默认发 JSON；这里要 multipart，文件一个个 append
    bodySerializer(body) {
      const form = new FormData()
      form.append('tool_id', body.tool_id)
      form.append('name', body.name)
      form.append('config', body.config)
      for (const f of files) form.append('files', f!)
      return form
    },
  })
  return response.ok ? { ok: true } : { ok: false, message: errorMessage(error, t.cloud.openFailed) }
}

export async function listTasks(): Promise<CloudTaskSummary[]> {
  const { data } = await api.GET('/api/cloud/tasks', { params: { query: { tool_id: TOOL_ID } } })
  if (!data) throw new Error(t.cloud.loadFailed)
  return data
}

export async function deleteTask(id: string): Promise<void> {
  const { response } = await api.DELETE('/api/cloud/tasks/{task_id}', { params: { path: { task_id: id } } })
  if (!response.ok) throw new Error(t.cloud.openFailed)
}

function isSavedConfig(value: unknown): value is SavedCompareConfig {
  return !!value && typeof value === 'object' && (value as { version?: unknown }).version === 1
}

/** 下载原始文件，按保存的配置恢复任务。恢复不完整时停在对应步骤，返回提示 */
export async function openTask(id: string): Promise<Outcome> {
  const { data: task, error } = await api.GET('/api/cloud/tasks/{task_id}', { params: { path: { task_id: id } } })
  if (!task) return { ok: false, message: errorMessage(error, t.cloud.openFailed) }
  if (!isSavedConfig(task.config)) return { ok: false, message: t.cloud.badConfig }

  const files = await Promise.all(
    task.files.map(async (f) => {
      const { data } = await api.GET('/api/cloud/tasks/{task_id}/files/{file_id}', {
        params: { path: { task_id: task.id, file_id: f.id } },
        parseAs: 'blob',
      })
      if (!data) throw new Error(t.cloud.openFailed)
      return new File([data], f.name, { type: f.content_type })
    }),
  )
  const done = await useCompareStore.getState().restore(files, task.config)
  return done ? { ok: true } : { ok: false, message: t.cloud.restoreStopped }
}
