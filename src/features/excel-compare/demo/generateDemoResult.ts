import {
  TAG_DIFF,
  TAG_EQUAL,
  TAG_MISSING,
  type CompareResult,
  type CompareSummary,
} from '../engine/types'

/**
 * 生成示例对比结果，用来在真实解析 / 对比引擎完成前验证表格性能和样式。
 * 使用固定种子的伪随机数，保证每次结果一致。
 */

const SURNAMES = [...'王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗高']
const GIVEN = [...'伟芳娜敏静丽强磊军洋勇艳杰娟涛明超秀霞平刚桂']
const DEPTS = ['人力资源部', '培训中心', '网络运维部', '市场部', '财务部', '政企客户部', '综合部']
const POSTS = ['工程师', '主管', '专员', '经理', '讲师', '分析师']
const FIELDS = ['姓名', '部门', '岗位', '入职日期', '学分']

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateDemoResult(rowCount: number, fileCount: 2 | 3 = 3): CompareResult {
  const start = performance.now()
  const rand = mulberry32(42)
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!
  const fileNames = ['2026年8月花名册.xlsx', '2026年9月花名册.xlsx', 'HR系统导出.csv'].slice(0, fileCount)

  const keys: string[] = new Array(rowCount)
  const tags = new Uint8Array(rowCount)
  const presence = new Uint8Array(rowCount)
  const diff = FIELDS.map(() => new Uint8Array(rowCount))
  const values = fileNames.map(() => FIELDS.map(() => new Array<string | null>(rowCount)))
  const summary: CompareSummary = { total: rowCount, equal: 0, diff: 0, missing: 0, duplicateKey: 0, emptyKey: 0 }
  const allPresent = (1 << fileCount) - 1

  for (let r = 0; r < rowCount; r++) {
    keys[r] = `FS${String(100000 + r)}`
    const base = [
      pick(SURNAMES) + pick(GIVEN) + (rand() < 0.5 ? pick(GIVEN) : ''),
      pick(DEPTS),
      pick(POSTS),
      `20${10 + Math.floor(rand() * 16)}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`,
      String(Math.floor(rand() * 120)),
    ]

    let mask = allPresent
    if (rand() < 0.03) mask &= ~(1 << Math.floor(rand() * fileCount))
    presence[r] = mask

    let rowHasDiff = false
    const changedField = rand() < 0.08 ? Math.floor(rand() * FIELDS.length) : -1
    const changedFile = Math.floor(rand() * fileCount)

    for (let f = 0; f < fileCount; f++) {
      const present = (mask >> f) & 1
      for (let k = 0; k < FIELDS.length; k++) {
        let v: string | null = present ? base[k]! : null
        if (present && k === changedField && f === changedFile) {
          v = k === 1 ? pick(DEPTS) : k === 4 ? String(Number(base[k]) + 5) : `${base[k]}*`
        }
        values[f]![k]![r] = v
      }
    }

    for (let k = 0; k < FIELDS.length; k++) {
      let first: string | null | undefined
      for (let f = 0; f < fileCount; f++) {
        if (!((mask >> f) & 1)) continue
        const v = values[f]![k]![r]
        if (first === undefined) first = v
        else if (v !== first) {
          diff[k]![r] = 1
          rowHasDiff = true
        }
      }
    }

    let t = 0
    if (rowHasDiff) {
      t |= TAG_DIFF
      summary.diff++
    }
    if (mask !== allPresent) {
      t |= TAG_MISSING
      summary.missing++
    }
    if (t === 0) {
      t = TAG_EQUAL
      summary.equal++
    }
    tags[r] = t
  }

  return {
    files: fileNames.map((fileName, i) => ({ fileId: `demo-${i}`, fileName })),
    keyLabel: '工号',
    fieldLabels: FIELDS,
    keys,
    tags,
    presence,
    values,
    diff,
    summary,
    elapsedMs: performance.now() - start,
  }
}
