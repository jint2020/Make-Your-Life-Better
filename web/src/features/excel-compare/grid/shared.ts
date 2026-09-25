/** 文件在界面上的代号 */
export const FILE_LETTERS = ['A', 'B', 'C'] as const

export function fileLetter(index: number): string {
  return FILE_LETTERS[index] ?? String(index + 1)
}

/** 列的排列方式：field = 同一字段的各文件值挨在一起（默认）；file = 按文件分组 */
export type ColumnLayout = 'field' | 'file'

/** 结果表的 rowData：只放行号，值从列式结果里取 */
export interface RowRef {
  i: number
}
