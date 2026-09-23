import * as XLSX from 'xlsx'

/**
 * 生成示例文件，让用户（和 E2E 测试）不用准备数据也能走完整流程。
 * 故意包含真实表格里的各种坑：大标题合并单元格、列名不一致、前导零、日期格式、
 * 空格、缺失、主键重复和主键为空。使用固定种子，每次结果一致。
 */

export interface SampleFile {
  name: string
  type: string
  bytes: Uint8Array
}

const SURNAMES = [...'王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗高']
const GIVEN = [...'伟芳娜敏静丽强磊军洋勇艳杰娟涛明超秀霞平刚桂']
const DEPTS = ['人力资源部', '培训中心', '网络运维部', '市场部', '财务部', '政企客户部', '综合部']
const POSTS = ['工程师', '主管', '专员', '经理', '讲师', '分析师']

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

interface Person {
  id: string
  name: string
  dept: string
  post: string
  joined: Date
  credits: number
}

function toXlsx(aoa: unknown[][], sheetName: string, merges: XLSX.Range[] = []): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'yyyy-mm-dd' })
  ws['!merges'] = merges
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['说明'], ['这是一个无关的工作表']]), '说明')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer)
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function makeSampleFiles(rowCount: number, fileCount: 2 | 3): SampleFile[] {
  const rand = mulberry32(7)
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!

  const people: Person[] = Array.from({ length: rowCount }, (_, i) => ({
    id: String(i + 1).padStart(6, '0'),
    name: pick(SURNAMES) + pick(GIVEN) + (rand() < 0.5 ? pick(GIVEN) : ''),
    dept: pick(DEPTS),
    post: pick(POSTS),
    joined: new Date(2010 + Math.floor(rand() * 16), Math.floor(rand() * 12), 1 + Math.floor(rand() * 28)),
    credits: Math.floor(rand() * 120),
  }))

  // 文件 A：8 月花名册。第 1 行是合并的大标题，表头在第 2 行
  const a: unknown[][] = [
    ['2026 年 8 月员工花名册'],
    ['工号', '姓名', '部门', '岗位', '入职日期', '学分'],
  ]
  people.forEach((p, i) => {
    if (i % 97 === 5) return // 8 月之后才入职
    a.push([p.id, p.name, p.dept, p.post, p.joined, p.credits])
  })
  a.push(['', '（空主键示例）', '综合部', '专员', null, 0])

  // 文件 B：9 月花名册。列名叫"员工编号"，有调岗、改名带空格、学分变化、主键重复
  const b: unknown[][] = [['员工编号', '姓名', '部门', '岗位', '入职日期', '学分']]
  people.forEach((p, i) => {
    if (i % 89 === 7) return // 9 月离职
    const dept = i % 23 === 3 ? pick(DEPTS) : p.dept
    const name = i % 31 === 4 ? ` ${p.name} ` : p.name // 空格：不算差异
    const credits = i % 17 === 2 ? p.credits + 5 : p.credits
    b.push([p.id, name, dept, p.post, p.joined, credits])
    if (i === 10) b.push([p.id, p.name, p.dept, p.post, p.joined, p.credits]) // 重复
  })

  const files: SampleFile[] = [
    {
      name: '2026年8月花名册.xlsx',
      type: XLSX_TYPE,
      bytes: toXlsx(a, '花名册', [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }]),
    },
    { name: '2026年9月花名册.xlsx', type: XLSX_TYPE, bytes: toXlsx(b, 'Sheet1') },
  ]

  if (fileCount === 3) {
    // 文件 C：HR 系统导出的 CSV。日期是字符串、学分是文本，少一个"岗位"列
    const lines = ['工号,姓名,部门,入职日期,学分']
    people.forEach((p, i) => {
      if (i % 101 === 9) return
      const d = p.joined
      const date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
      const dept = i % 29 === 6 ? pick(DEPTS) : p.dept
      lines.push([p.id, p.name, dept, date, String(p.credits)].join(','))
    })
    const text = '﻿' + lines.join('\r\n') + '\r\n'
    files.push({ name: 'HR系统导出.csv', type: 'text/csv', bytes: new TextEncoder().encode(text) })
  }
  return files
}
