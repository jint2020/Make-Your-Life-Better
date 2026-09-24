/**
 * 界面文案集中管理。以后要做 i18n，把这个文件换成按语言加载即可。
 */
export const copy = {
  app: {
    name: 'Make Your Life Better',
    shortName: 'MYLB',
    tagline: '浏览器里的提效小工具，打开就能用',
    privacy: '所有数据只在你的浏览器里处理和保存，不会上传到任何服务器。',
    home: '首页',
    allTools: '全部工具',
    notFoundTitle: '页面不存在',
    notFoundBody: '你访问的页面不存在，可能是链接写错了。',
    backHome: '回到首页',
    errorTitle: '页面出错了',
    errorBody: '加载这个页面时出现问题，可以刷新重试。',
    reload: '刷新',
    loading: '加载中…',
  },
  toolStatus: {
    new: '新',
    beta: '测试中',
    stable: '',
  },
  theme: {
    menuLabel: '主题设置',
    modeLabel: '显示模式',
    light: '浅色',
    dark: '深色',
    system: '跟随系统',
    presetLabel: '主题配色',
  },
} as const
