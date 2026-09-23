/** 文件在界面上的代号 */
export const FILE_LETTERS = ['A', 'B', 'C'] as const

/** 结果表的 rowData：只放行号，值从列式结果里取 */
export interface RowRef {
  i: number
}
