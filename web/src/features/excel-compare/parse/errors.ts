import type { ParseErrorCode, ParseErrorInfo } from './types'

export const PARSE_ERROR_MESSAGES: Record<ParseErrorCode, string> = {
  'unsupported-xls': '不支持旧版 .xls 格式，请在 Excel 里另存为 .xlsx 后再上传。',
  'unsupported-type': '只支持 .xlsx 和 .csv 文件。',
  encrypted: '文件设置了密码保护，请在 Excel 里取消密码后再上传。',
  corrupt: '文件无法读取，可能已损坏，或者并不是真正的 Excel 文件。',
  'empty-sheet': '这个工作表在表头下面没有数据。',
  'header-out-of-range': '表头行号超出了工作表的行数。',
  'too-large': '文件太大，浏览器内存不够。建议拆分文件，或者只保留需要的列后再试。',
  'not-found': '文件已失效，请重新上传。',
  unknown: '解析时出现未知错误。',
}

export class ParseError extends Error {
  readonly code: ParseErrorCode
  constructor(code: ParseErrorCode, detail?: string) {
    super(detail ? `${PARSE_ERROR_MESSAGES[code]}（${detail}）` : PARSE_ERROR_MESSAGES[code])
    this.code = code
  }
}

export function toErrorInfo(e: unknown): ParseErrorInfo {
  if (e instanceof ParseError) return { code: e.code, message: e.message }
  if (e instanceof RangeError) return { code: 'too-large', message: PARSE_ERROR_MESSAGES['too-large'] }
  const msg = e instanceof Error ? e.message : String(e)
  if (/password|encrypt/i.test(msg)) return { code: 'encrypted', message: PARSE_ERROR_MESSAGES.encrypted }
  return { code: 'unknown', message: `${PARSE_ERROR_MESSAGES.unknown}（${msg}）` }
}
