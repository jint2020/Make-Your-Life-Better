import {
  CellStyleModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ColumnApiModule,
  ExternalFilterModule,
  LocaleModule,
  ModuleRegistry,
  RowApiModule,
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
  // 显示行数（getDisplayedRowCount）、导出时按显示顺序取行（forEachNodeAfterFilterAndSort）
  RowApiModule,
  ClientSideRowModelApiModule,
  TooltipModule,
  LocaleModule,
  ...(import.meta.env.DEV ? [ValidationModule] : []),
])
