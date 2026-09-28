import { api, errorMessage } from '@/shared/api/client'
import { t } from './copy'

export type ConvertWarning = 'table_truncated' | 'unreadable_glyphs'

export interface ConvertSuccess {
  markdown: string
  warnings: ConvertWarning[]
}

export type ConvertOutcome = { ok: true; value: ConvertSuccess } | { ok: false; message: string }

/**
 * 上传单个文件，服务端用 markitdown 转换成 Markdown；响应返回后服务端立即删除文件，不做存储。
 * 支持用 AbortSignal 取消：移除队列中正在转换的文件时会调用。
 */
export async function convertFile(file: File, signal: AbortSignal): Promise<ConvertOutcome> {
  try {
    const { data, error, response } = await api.POST('/api/convert', {
      // 生成的类型里 file 是 binary format（string）；实际传的是 File 对象，交给下面的 bodySerializer 处理
      body: { file: file as unknown as string },
      bodySerializer() {
        const form = new FormData()
        form.append('file', file)
        return form
      },
      signal,
    })
    if (data) return { ok: true, value: data }
    return { ok: false, message: errorMessage(error, t.errors.fallback(response.status)) }
  } catch {
    if (signal.aborted) return { ok: false, message: t.errors.aborted }
    return { ok: false, message: t.errors.fallback(0) }
  }
}
