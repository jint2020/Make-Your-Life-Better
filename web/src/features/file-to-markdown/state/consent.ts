import { readLocal, writeLocal } from '@/shared/storage/local'

const KEY = 'mylb:file-to-markdown:consent'

/** 用户是否已经确认过"文件会上传到服务器转换"的说明 */
export function hasConsent(): boolean {
  return readLocal(KEY, false)
}

export function grantConsent(): void {
  writeLocal(KEY, true)
}
