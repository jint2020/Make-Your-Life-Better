import { transfer } from 'comlink'

import { t } from '../copy'
import { compareWorker } from '../worker/client'
import { exportStamp, type ExportRequest } from './buildExport'

/** 在 Worker 里生成 xlsx，然后在浏览器里触发下载 */
export async function downloadExport(req: ExportRequest): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await compareWorker.api().exportXlsx(transfer(req, [req.rows.buffer as ArrayBuffer]))
  if (!res.ok) return { ok: false, message: res.error.message || t.export.failed }

  const blob = new Blob([res.value as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = t.export.fileName(exportStamp(new Date()))
  document.body.append(a)
  a.click()
  a.remove()
  // 给浏览器一点时间开始下载，再释放
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return { ok: true }
}
