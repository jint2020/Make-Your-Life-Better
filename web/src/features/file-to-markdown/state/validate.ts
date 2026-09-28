/**
 * 单个文件的校验：扩展名和大小。数量上限（一次最多 10 个）在加入队列时另外判断，见 queue.ts。
 * markitdown 实际按文件内容判断格式（magika），这里的扩展名检查只是为了体验，不承担安全职责。
 */

export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.xlsx', '.csv', '.html', '.htm', '.epub'] as const

/** 这些旧格式 markitdown 不支持，提示用户先在原应用里另存为新格式 */
export const RESAVE_SUGGESTIONS: Record<string, string> = {
  '.doc': '.docx',
  '.ppt': '.pptx',
  '.xls': '.xlsx',
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024

export type FileRejection =
  | { kind: 'resave'; ext: string; suggestion: string }
  | { kind: 'unsupported' }
  | { kind: 'too-large' }

export function getExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i <= 0 ? '' : name.slice(i).toLowerCase()
}

/** 这个文件能不能加入队列；能就返回 null */
export function validateFile(file: { name: string; size: number }): FileRejection | null {
  const ext = getExtension(file.name)
  const suggestion = RESAVE_SUGGESTIONS[ext]
  if (suggestion) return { kind: 'resave', ext, suggestion }
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) return { kind: 'unsupported' }
  if (file.size > MAX_FILE_BYTES) return { kind: 'too-large' }
  return null
}
