import type { ComponentType } from 'react'
import { FileSpreadsheetIcon, type LucideIcon } from 'lucide-react'

export type ToolStatus = 'new' | 'beta' | 'stable'

/** 每个工具的入口模块都要导出一个 Component */
export interface ToolModule {
  Component: ComponentType
}

export interface ToolMeta {
  id: string
  /** 路由路径，不带前导斜杠 */
  path: string
  name: string
  description: string
  icon: LucideIcon
  status: ToolStatus
  /** 首页搜索用 */
  keywords: string[]
  load: () => Promise<ToolModule>
}

/**
 * 工具注册表。新增工具：在 src/features/<tool-id>/ 下建目录，入口导出 Component，然后在这里加一行。
 */
export const TOOLS: ToolMeta[] = [
  {
    id: 'excel-compare',
    path: 'excel-compare',
    name: 'Excel 数据对比',
    description: '上传 2～3 个 Excel / CSV，按主键匹配后逐字段对比，快速找出新增、缺失和不一致的数据。',
    icon: FileSpreadsheetIcon,
    status: 'beta',
    keywords: ['excel', 'csv', '对比', '比对', 'diff', '表格', 'vlookup'],
    load: () => import('@/features/excel-compare'),
  },
]

export function findToolByPath(path: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.path === path)
}
