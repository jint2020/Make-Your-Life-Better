/**
 * CSV 编码检测：先按严格 UTF-8 解码，失败就用 GB18030（GBK 的超集）。
 * 中文版 Excel "另存为 CSV" 默认是 GBK。
 */

export type CsvEncoding = 'utf-8' | 'gb18030'

export interface DecodedText {
  text: string
  encoding: CsvEncoding
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

export function decodeCsvBytes(bytes: Uint8Array, forced?: CsvEncoding | null): DecodedText {
  if (forced) {
    return { text: stripBom(new TextDecoder(forced).decode(bytes)), encoding: forced }
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text: stripBom(text), encoding: 'utf-8' }
  } catch {
    return { text: new TextDecoder('gb18030').decode(bytes), encoding: 'gb18030' }
  }
}
