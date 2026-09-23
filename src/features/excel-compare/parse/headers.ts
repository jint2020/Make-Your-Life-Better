/**
 * 表头清洗：
 * - 空列名 → "列C"（按 Excel 列字母）
 * - 重名列 → "姓名"、"姓名(2)"、"姓名(3)"
 */

export function columnLetter(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/**
 * @param columnIndexes 每个表头对应的原始列号（丢掉空列后仍按原列字母命名）；不传时按下标
 */
export function normalizeHeaders(raw: readonly unknown[], columnIndexes?: readonly number[]): string[] {
  const base = raw.map((h, i) => {
    const s = h == null ? '' : String(h).trim()
    return s === '' ? `列${columnLetter(columnIndexes?.[i] ?? i)}` : s
  })

  const used = new Set<string>()
  const counts = new Map<string, number>()
  return base.map((name) => {
    if (!used.has(name)) {
      used.add(name)
      counts.set(name, 1)
      return name
    }
    let k = counts.get(name) ?? 1
    let candidate: string
    do {
      k++
      candidate = `${name}(${k})`
    } while (used.has(candidate))
    counts.set(name, k)
    used.add(candidate)
    return candidate
  })
}
