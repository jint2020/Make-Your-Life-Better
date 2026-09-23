import { expose, transfer } from 'comlink'

import { generateDemoResult } from '../demo/generateDemoResult'
import type { CompareResult } from '../engine/types'

/**
 * Excel 对比 Worker：解析和对比都在这里跑，不阻塞主线程。
 * TODO(下一阶段)：parseFile(file, options)、compare(tables, config)
 */
const api = {
  ping(): string {
    return 'pong'
  },

  generateDemo(rowCount: number, fileCount: 2 | 3): CompareResult {
    const result = generateDemoResult(rowCount, fileCount)
    // 类型化数组的底层 buffer 直接转移，不复制
    return transfer(result, [
      result.tags.buffer,
      result.presence.buffer,
      ...result.diff.map((d) => d.buffer),
    ] as ArrayBuffer[])
  },
}

export type CompareWorkerApi = typeof api

expose(api)
