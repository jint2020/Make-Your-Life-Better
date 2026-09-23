import {
  CellStyleModule,
  ClientSideRowModelModule,
  ColumnApiModule,
  ExternalFilterModule,
  LocaleModule,
  ModuleRegistry,
  RowStyleModule,
  TooltipModule,
  ValidationModule,
} from 'ag-grid-community'

/** 只注册用到的模块，控制包体积 */
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ExternalFilterModule,
  CellStyleModule,
  RowStyleModule,
  ColumnApiModule,
  TooltipModule,
  LocaleModule,
  ...(import.meta.env.DEV ? [ValidationModule] : []),
])
