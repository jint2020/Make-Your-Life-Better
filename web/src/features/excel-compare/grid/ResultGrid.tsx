import { useCallback, useEffect, useMemo, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ColGroupDef, GridApi, IRowNode } from 'ag-grid-community'
import { AG_GRID_LOCALE_CN } from '@ag-grid-community/locale'

import { agGridTheme } from '@/shared/theme/agGridTheme'
import { TAG_DIFF, TAG_EQUAL, TAG_MISSING, type CompareResult } from '../engine/types'
import { t } from '../copy'
import { fileLetter, type RowRef } from './shared'
import { StatusCell } from './StatusCell'
import './registerAgGrid'
import './grid.css'

export type TagFilter = 'all' | 'diff' | 'missing' | 'equal'

/** 列的排列方式：field = 同一字段的各文件值挨在一起（默认）；file = 按文件分组 */
export type ColumnLayout = 'field' | 'file'

const TAG_MASK: Record<Exclude<TagFilter, 'all'>, number> = {
  diff: TAG_DIFF,
  missing: TAG_MISSING,
  equal: TAG_EQUAL,
}

interface ResultGridProps {
  result: CompareResult
  tagFilter: TagFilter
  keySearch: string
  onlyDiffColumns: boolean
  layout: ColumnLayout
  onRowClick?: (rowIndex: number) => void
  onVisibleCountChange?: (n: number) => void
}

const LOCALE = { ...AG_GRID_LOCALE_CN, noRowsToShow: t.result.empty }

/**
 * 对比结果表。rowData 只放行号，值从列式数组里取。
 * 列默认按"字段为主、文件为次"分组（同一字段的 A / B / C 挨在一起，最好比较），也可以切换成按文件分组。
 */
export function ResultGrid({
  result,
  tagFilter,
  keySearch,
  onlyDiffColumns,
  layout,
  onRowClick,
  onVisibleCountChange,
}: ResultGridProps) {
  const apiRef = useRef<GridApi<RowRef> | null>(null)
  // AG Grid 的外部筛选回调读这个 ref，回调本身保持稳定
  const filterRef = useRef({ tagFilter, keySearch })

  const rowData = useMemo<RowRef[]>(
    () => Array.from({ length: result.keys.length }, (_, i) => ({ i })),
    [result],
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
      valueGetter: (p) => (p.data ? result.values[f]?.[k]?.[p.data.i] : null),
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

  const isExternalFilterPresent = useCallback(
    () => filterRef.current.tagFilter !== 'all' || filterRef.current.keySearch.trim() !== '',
    [],
  )

  const doesExternalFilterPass = useCallback(
    (node: IRowNode<RowRef>) => {
      if (!node.data) return false
      const { tagFilter: tf, keySearch: ks } = filterRef.current
      const i = node.data.i
      if (tf !== 'all' && !((result.tags[i] ?? 0) & TAG_MASK[tf])) return false
      const q = ks.trim()
      if (q && !result.keys[i]?.includes(q)) return false
      return true
    },
    [result],
  )

  useEffect(() => {
    filterRef.current = { tagFilter, keySearch }
    const api = apiRef.current
    if (!api) return
    api.onFilterChanged()
    onVisibleCountChange?.(api.getDisplayedRowCount())
  }, [tagFilter, keySearch, onVisibleCountChange])

  return (
    <AgGridReact<RowRef>
      theme={agGridTheme}
      localeText={LOCALE}
      rowData={rowData}
      columnDefs={columnDefs}
      defaultColDef={{ sortable: true, resizable: true, suppressMovable: true }}
      getRowId={(p) => String(p.data.i)}
      isExternalFilterPresent={isExternalFilterPresent}
      doesExternalFilterPass={doesExternalFilterPass}
      suppressFieldDotNotation
      animateRows={false}
      rowClass={onRowClick ? 'cursor-pointer' : undefined}
      onRowClicked={(e) => e.data && onRowClick?.(e.data.i)}
      onGridReady={(e) => {
        apiRef.current = e.api
        e.api.onFilterChanged()
        onVisibleCountChange?.(e.api.getDisplayedRowCount())
      }}
    />
  )
}
