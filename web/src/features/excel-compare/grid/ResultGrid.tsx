import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ColGroupDef, IDatasource } from 'ag-grid-community'
import { AG_GRID_LOCALE_CN } from '@ag-grid-community/locale'

import { agGridTheme } from '@/shared/theme/agGridTheme'
import { cellValue, type CompareResult } from '../engine/types'
import { t } from '../copy'
import { filterRows, sortRows, type SortItem, type TagFilter } from './rowOrder'
import { fileLetter, type ColumnLayout, type RowRef } from './shared'
import { StatusCell } from './StatusCell'
import './registerAgGrid'
import './grid.css'

export type { TagFilter } from './rowOrder'
export type { ColumnLayout } from './shared'

/** 无限滚动行模型每次取多少行 */
const BLOCK_SIZE = 200

interface ResultGridProps {
  result: CompareResult
  tagFilter: TagFilter
  keySearch: string
  onlyDiffColumns: boolean
  layout: ColumnLayout
  onRowClick?: (rowIndex: number) => void
  onVisibleCountChange?: (n: number) => void
  /** 导出用：取当前筛选、排序后显示的行（结果里的行下标，按显示顺序）。每次返回新数组，调用方可以转交给 Worker */
  displayedRowsRef?: RefObject<(() => Int32Array) | null>
}

const LOCALE = { ...AG_GRID_LOCALE_CN, noRowsToShow: t.result.empty }

/**
 * 对比结果表。行只放行号，值从列式数组里取。
 * 列默认按"字段为主、文件为次"分组（同一字段的 A / B / C 挨在一起，最好比较），也可以切换成按文件分组。
 *
 * 用 AG Grid 的"无限滚动"行模型，而不是默认的客户端行模型：客户端行模型要给每一行建节点，
 * 10 万行时初始化、切换筛选都要卡 100ms 以上；无限滚动只给看得见的那一段建节点。
 * 筛选、排序由 rowOrder.ts 在行号数组上算好，表格按需来取。
 */
export function ResultGrid({
  result,
  tagFilter,
  keySearch,
  onlyDiffColumns,
  layout,
  onRowClick,
  onVisibleCountChange,
  displayedRowsRef,
}: ResultGridProps) {
  const filtered = useMemo(() => filterRows(result, tagFilter, keySearch), [result, tagFilter, keySearch])

  // 排好序的行号按排序设置缓存：滚动时反复取数据不用重排
  const sortCache = useRef<{ source: Int32Array; key: string; rows: Int32Array } | null>(null)
  const lastSortModel = useRef<readonly SortItem[]>([])
  const orderedRows = useCallback(
    (sortModel: readonly SortItem[]): Int32Array => {
      const key = JSON.stringify(sortModel)
      const cached = sortCache.current
      if (cached && cached.source === filtered && cached.key === key) return cached.rows
      const rows = sortRows(result, filtered, sortModel)
      sortCache.current = { source: filtered, key, rows }
      return rows
    },
    [result, filtered],
  )

  // 筛选或搜索变了就换一个数据源，表格会清掉缓存、从头重新取
  const datasource = useMemo<IDatasource>(
    () => ({
      rowCount: filtered.length,
      getRows(params) {
        const sortModel = params.sortModel as SortItem[]
        lastSortModel.current = sortModel
        const rows = orderedRows(sortModel)
        const end = Math.min(params.endRow, rows.length)
        const block: RowRef[] = []
        for (let pos = params.startRow; pos < end; pos++) block.push({ i: rows[pos]! })
        params.successCallback(block, rows.length)
      },
    }),
    [filtered, orderedRows],
  )

  const fieldHasDiff = useMemo(() => result.diff.map((col) => col.some((m) => m !== 0)), [result])

  const columnDefs = useMemo<(ColDef<RowRef> | ColGroupDef<RowRef>)[]>(() => {
    const keyCol: ColDef<RowRef> = {
      colId: 'key',
      headerName: result.keyLabel,
      pinned: 'left',
      width: 130,
      cellClass: 'mylb-key-cell',
      valueGetter: (p) => (p.data ? result.keys[p.data.i] : null),
    }
    const statusCol: ColDef<RowRef> = {
      colId: 'status',
      headerName: t.result.statusCol,
      pinned: 'left',
      width: 200,
      cellRenderer: StatusCell,
      cellRendererParams: { result },
      sortable: false,
    }
    const displayCols: ColDef<RowRef>[] = result.displayLabels.map((label, k) => ({
      colId: `display_${k}`,
      headerName: label,
      width: 120,
      valueGetter: (p) => (p.data ? result.displayValues[k]?.[p.data.i] : null),
    }))
    // 文件 f、字段 k 的值列。差异掩码的第 f 位为 1 才高亮：3 个文件时只标"不一样的那个"
    // 某个文件没有这个字段（没映射）时，那一列整列都是空的，直接不显示
    const hasField = (f: number, k: number) => (((result.fieldFiles[k] ?? 0) >> f) & 1) === 1
    const valueCol = (f: number, k: number, extra: Partial<ColDef<RowRef>>): ColDef<RowRef> => ({
      colId: `v_${f}_${k}`,
      flex: 1,
      minWidth: 112,
      hide: onlyDiffColumns && !fieldHasDiff[k],
      valueGetter: (p) => (p.data ? cellValue(result, f, k, p.data.i) : null),
      valueFormatter: (p) => (p.value == null ? t.result.missingCell : String(p.value)),
      cellClassRules: {
        'mylb-cell-missing': (p) => !!p.data && !(((result.presence[p.data.i] ?? 0) >> f) & 1),
        'mylb-cell-diff': (p) => !!p.data && (((result.diff[k]?.[p.data.i] ?? 0) >> f) & 1) === 1,
      },
      ...extra,
    })

    const groups: ColGroupDef<RowRef>[] =
      layout === 'field'
        ? result.fieldLabels.map((label, k) => ({
            groupId: `field-${k}`,
            headerName: label,
            headerClass: 'mylb-col-group',
            children: result.files.flatMap((file, f) => {
              if (!hasField(f, k)) return []
              // 每组第一列加左边线，把字段和字段隔开
              const first = f === result.files.findIndex((_, g) => hasField(g, k))
              return [
                valueCol(f, k, {
                  headerName: fileLetter(f),
                  headerTooltip: file.fileName,
                  cellClass: first ? 'mylb-group-start' : undefined,
                  headerClass: first ? 'mylb-group-start' : undefined,
                }),
              ]
            }),
          }))
        : result.files.map((file, f) => ({
            groupId: `file-${f}`,
            headerName: `${fileLetter(f)} · ${file.fileName}`,
            headerClass: 'mylb-col-group',
            children: result.fieldLabels.flatMap((label, k) =>
              hasField(f, k) ? [valueCol(f, k, { headerName: label, minWidth: 124 })] : [],
            ),
          }))
    return [keyCol, statusCol, ...displayCols, ...groups]
  }, [result, onlyDiffColumns, fieldHasDiff, layout])

  // 行数变了（切换筛选、搜索）就通知外面
  useEffect(() => {
    onVisibleCountChange?.(filtered.length)
  }, [filtered, onVisibleCountChange])

  // 导出：当前筛选、排序后的全部行（不只是已经滚动加载过的）。
  // 返回拷贝：导出会把数组转交（transfer）给 Worker，转交后原数组就不能用了，不能把表格自己缓存的那份交出去
  useEffect(() => {
    if (!displayedRowsRef) return
    displayedRowsRef.current = () => orderedRows(lastSortModel.current).slice()
  }, [displayedRowsRef, orderedRows])

  return (
    <AgGridReact<RowRef>
      theme={agGridTheme}
      localeText={LOCALE}
      rowModelType="infinite"
      datasource={datasource}
      cacheBlockSize={BLOCK_SIZE}
      columnDefs={columnDefs}
      defaultColDef={{ sortable: true, resizable: true, suppressMovable: true }}
      getRowId={(p) => String(p.data.i)}
      suppressFieldDotNotation
      animateRows={false}
      rowClass={onRowClick ? 'cursor-pointer' : undefined}
      onRowClicked={(e) => e.data && onRowClick?.(e.data.i)}
    />
  )
}
