import type { CellValue, NormalizeOptions } from './types'

/**
 * 把单元格值归一化成可比较的字符串。两个值归一化结果相同 ⇔ 视为相等。
 *
 * 默认规则（始终生效）：
 * - 去掉首尾空白（含全角空格、不换行空格）
 * - 空单元格、空字符串、"null" 都视为空
 * - 数字按数值比较：1、"1.0"、"1,000" 与 1000 …
 * - 日期统一成 YYYY-MM-DD
 * - 超过 15 位的纯数字串（身份证、银行卡号）始终按文本比，避免精度丢失导致误判相等
 */

export const EMPTY = ''

const NUMERIC_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i
const THOUSANDS_RE = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/
const DATE_RE = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T]0{1,2}:0{2}(?::0{2})?)?$/
const MAX_SAFE_DIGITS = 15

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

// 日期的取值种类通常很少，缓存格式化结果能省下大量字符串拼接
const dateCache = new Map<number, string>()

export function formatDate(d: Date): string {
  const t = d.getTime()
  let s = dateCache.get(t)
  if (s === undefined) {
    s = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    if (dateCache.size > 50_000) dateCache.clear()
    dateCache.set(t, s)
  }
  return s
}

export function toHalfWidth(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.charCodeAt(0)
    if (code === 0x3000) out += ' '
    else if (code >= 0xff01 && code <= 0xff5e) out += String.fromCharCode(code - 0xfee0)
    else out += ch
  }
  return out
}

function canonicalNumber(n: number): string {
  if (Number.isSafeInteger(n)) return String(n)
  if (!Number.isFinite(n)) return String(n)
  // 消除浮点噪声：0.1 + 0.2 → 0.3
  return String(Number.parseFloat(n.toPrecision(15)))
}

function hasLeadingZero(s: string): boolean {
  const unsigned = s.replace(/^[+-]/, '')
  return unsigned.length > 1 && unsigned[0] === '0' && unsigned[1] !== '.'
}

function countDigits(s: string): number {
  let n = 0
  for (const ch of s) if (ch >= '0' && ch <= '9') n++
  return n
}

export function normalizeValue(value: CellValue | undefined, opts: NormalizeOptions): string {
  if (value == null) return EMPTY
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? EMPTY : formatDate(value)
  if (typeof value === 'number') return canonicalNumber(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'

  let s = opts.fullToHalf ? toHalfWidth(value) : value
  s = s.trim()
  if (s === '' || s.toLowerCase() === 'null') return EMPTY

  // 快速路径：不是数字 / 符号 / 小数点开头的，不可能是数字或日期，跳过正则
  const c0 = s.charCodeAt(0)
  if (!((c0 >= 48 && c0 <= 57) || c0 === 43 || c0 === 45 || c0 === 46)) {
    return opts.ignoreCase ? s.toLowerCase() : s
  }

  const date = DATE_RE.exec(s)
  if (date) {
    const [, y, m, d] = date
    return `${y}-${pad2(Number(m))}-${pad2(Number(d))}`
  }

  const numeric = THOUSANDS_RE.test(s) ? s.replaceAll(',', '') : s
  if (NUMERIC_RE.test(numeric) && countDigits(numeric) <= MAX_SAFE_DIGITS) {
    if (!(opts.keepLeadingZeros && hasLeadingZero(numeric))) {
      return canonicalNumber(Number(numeric))
    }
  }

  return opts.ignoreCase ? s.toLowerCase() : s
}

/** 组合主键：各部分归一化后用不可见分隔符拼接；任一部分为空则返回 null（主键为空） */
export function buildKey(parts: (CellValue | undefined)[], opts: NormalizeOptions): string | null {
  const normalized = parts.map((p) => normalizeValue(p, opts))
  if (normalized.some((p) => p === EMPTY)) return null
  return normalized.join('\u001f')
}
