import {
  CellStyleModule,
  ColumnApiModule,
  InfiniteRowModelModule,
  LocaleModule,
  ModuleRegistry,
  RowStyleModule,
  TooltipModule,
  ValidationModule,
} from 'ag-grid-community'

/**
 * 只注册用到的模块，控制包体积。
 * 注意：没注册的模块，对应的 API 在生产构建里会静默返回 undefined（开发时 ValidationModule 会报错）
 */
ModuleRegistry.registerModules([
  // 结果表用无限滚动行模型（见 ResultGrid），不用客户端行模型
  InfiniteRowModelModule,
  CellStyleModule,
  RowStyleModule,
  ColumnApiModule,
  TooltipModule,
  LocaleModule,
  ...(import.meta.env.DEV ? [ValidationModule] : []),
])
