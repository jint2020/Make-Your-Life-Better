import type { ComponentType } from 'react'
import { FileSpreadsheetIcon, FileTextIcon, type LucideIcon } from 'lucide-react'

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
  /**
   * 这个工具依赖后端才能用（目前只有"文件转 Markdown"）。后端不可用时，
   * 首页卡片和顶部导航仍然照常显示，只是标"暂不可用"；不像账号/云端入口那样直接隐藏。
   */
  requiresBackend?: boolean
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
  {
    id: 'file-to-markdown',
    path: 'file-to-markdown',
    name: '文件转 Markdown',
    description: '把 PDF、Word、PPT、Excel 等文件转成 Markdown，方便交给 AI 使用。需要登录；文件会上传到服务器转换，转完立即删除。',
    icon: FileTextIcon,
    status: 'new',
    keywords: ['markdown', 'md', 'pdf', 'word', 'docx', 'ppt', 'pptx', 'excel', '转换', 'ai', 'markitdown'],
    requiresBackend: true,
    load: () => import('@/features/file-to-markdown'),
  },
]

export function findToolByPath(path: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.path === path)
}
