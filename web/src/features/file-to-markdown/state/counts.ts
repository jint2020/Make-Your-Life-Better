/**
 * 字符数和 Token 粗估。都是纯函数：结果到达时算一次存起来，不在每次渲染时重新计算。
 */

export interface TextCounts {
  /** Unicode 码点数量（不是 UTF-16 code unit 数，一个 emoji 或生僻字只算一个） */
  charCount: number
  /** Token 粗估：中日韩文字每个算 1 个，其余字符每 4 个算 1 个（向上取整） */
  tokenCount: number
}

/** 中日韩文字：汉字（含扩展区）、假名、韩文音节、CJK 标点、全角字符。范围划分是近似的，估算本来就"仅供参考" */
function isCjkCodePoint(cp: number): boolean {
  return (
    (cp >= 0x3000 && cp <= 0x303f) || // CJK 标点符号
    (cp >= 0x3040 && cp <= 0x30ff) || // 平假名、片假名
    (cp >= 0x3400 && cp <= 0x4dbf) || // 中日韩统一表意文字扩展 A
    (cp >= 0x4e00 && cp <= 0x9fff) || // 中日韩统一表意文字（常用汉字）
    (cp >= 0xac00 && cp <= 0xd7a3) || // 韩文音节
    (cp >= 0xf900 && cp <= 0xfaff) || // 中日韩兼容表意文字
    (cp >= 0xff00 && cp <= 0xffef) || // 全角字符、半角片假名
    (cp >= 0x20000 && cp <= 0x2fffd) // 中日韩统一表意文字扩展 B 及以上（增补平面，生僻字）
  )
}

/**
 * 一次遍历同时算出字符数和 Token 粗估，避免大文本被扫描两遍。
 * 用下标 + charCodeAt 手动处理代理对，比 for...of 迭代器快，多兆字符的结果也能在主线程可接受的时间内算完。
 */
export function computeTextCounts(text: string): TextCounts {
  let charCount = 0
  let cjkCount = 0
  let otherCount = 0
  const len = text.length

  for (let i = 0; i < len; i++) {
    let cp = text.charCodeAt(i)
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < len) {
      const low = text.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        // 高低代理项组成一个码点，只数一次
        cp = (cp - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000
        i++
      }
    }
    charCount++
    if (isCjkCodePoint(cp)) cjkCount++
    else otherCount++
  }

  return { charCount, tokenCount: cjkCount + Math.ceil(otherCount / 4) }
}

export function formatCharCount(n: number): string {
  return `${n.toLocaleString('zh-CN')} 字符`
}

/**
 * Token 数的展示：100 以内精确显示；1 万以内四舍五入到百位（带千分位）；
 * 1 万以上显示"约 X 万"，保留 1 位小数并去掉多余的 .0。
 */
export function formatTokenCount(n: number): string {
  if (n < 100) return `约 ${n} Token`
  if (n < 10_000) {
    const rounded = Math.round(n / 100) * 100
    return `约 ${rounded.toLocaleString('zh-CN')} Token`
  }
  const wan = Math.round((n / 10_000) * 10) / 10
  const label = Number.isInteger(wan) ? String(wan) : wan.toFixed(1)
  return `约 ${label} 万 Token`
}
