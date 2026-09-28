import type { ConvertWarning } from './api'

/** 文件转 Markdown 工具的界面文案 */
export const t = {
  title: '文件转 Markdown',
  subtitle: '把 PDF、Word、PPT、Excel 等文件转成 Markdown，方便交给 AI 使用。',
  reminder: '文件会上传到服务器转换，转完立即删除，不会保存。',

  consent: {
    title: '上传前请确认',
    body: '文件会上传到我们的服务器，用 markitdown 转换成 Markdown，转换完成后立即删除，不会保存，也不会发给第三方。',
    confirm: '继续',
    cancel: '取消',
  },

  unavailable: {
    body: '文件转 Markdown 需要服务器支持才能转换文件，服务器目前不可用，这个工具暂时没法使用。不影响其他工具，稍后可以再来看看。',
  },

  anonymous: {
    title: '需要登录后使用',
    body: '这个工具会把文件上传到服务器转换，为了避免被滥用，需要先登录才能使用。其他工具都不需要登录；登录后也只有这一个工具会上传文件。',
    cta: '登录后使用',
  },

  dropTitle: '拖拽文件到这里，或点击选择',
  dropHint: '支持 .pdf .docx .pptx .xlsx .csv .html .htm .epub，一次最多 10 个文件',
  dropMore: '继续添加文件（拖拽或点击选择）',
  dropFull: '已经有 10 个文件了，移除一个才能再添加',

  status: {
    queued: '排队中',
    converting: '转换中',
    done: '完成',
    failed: '失败',
  },

  actions: {
    copy: '复制',
    copied: '已复制',
    download: '下载',
    retry: '重试',
    remove: '移除',
  },

  reject: {
    resave: (ext: string, suggestion: string) => `不支持 ${ext} 格式，请在原应用里另存为 ${suggestion} 后再上传。`,
    unsupported: '暂不支持这种文件类型。',
    tooLarge: (size: string) => `文件太大（${size}），最多支持 20 MB。`,
    tooMany: (n: number) => `最多同时处理 10 个文件，多出来的 ${n} 个没有添加。`,
  },

  warnings: {
    table_truncated: '表格太大，已按上限截断，结果里有说明。',
    unreadable_glyphs: '部分文字因字体编码问题没能识别，结果里会出现 (cid:数字)。',
  } satisfies Record<ConvertWarning, string>,

  truncated: '结果较长，只预览了前 20 万字符；复制和下载的是完整内容。',

  emptyPane: '在左侧列表选一个文件，转换完成后这里会显示 Markdown 源码。',

  tokenTooltip: '不同模型差异较大，仅供参考',

  errors: {
    fallback: (status: number): string => {
      switch (status) {
        case 401:
          return '登录已过期，请重新登录后再试。'
        case 413:
          return '文件太大，服务器拒绝接收。'
        case 415:
          return '不支持的文件类型。'
        case 422:
          return '这个文件无法转换。'
        case 429:
          return '请求太频繁，请稍后再试。'
        case 503:
          return '服务器繁忙，请稍后再试。'
        default:
          return '转换失败，请稍后再试。'
      }
    },
    aborted: '已取消',
  },
}
