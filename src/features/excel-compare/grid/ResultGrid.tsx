import { useCallback, useEffect, useMemo, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ColGroupDef, GridApi, IRowNode } from 'ag-grid-community'
import { AG_GRID_LOCALE_CN } from '@ag-grid-community/locale'

import { agGridTheme } from '@/shared/theme/agGridTheme'
import { TAG_DIFF, TAG_EQUAL, TAG_MISSING, type CompareResult } from '../engine/types'
import { t } from '../copy'
import { FILE_LETTERS, type RowRef } from './shared'
import { StatusCell } from './StatusCell'
import './registerAgGrid'
import './grid.css'

export type TagFilter = 'all' | 'diff' | 'missing' | 'equal'

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
  onVisibleCountChange?: (n: number) => void
}

/**
 * 对比结果表。列按"文件为主、字段为次"分组；rowData 只放行号，值从列式数组里取。
 */
export function ResultGrid({ result, tagFilter, keySearch, onlyDiffColumns, onVisibleCountChange }: ResultGridProps) {
  const apiRef = useRef<GridApi<RowRef> | null>(null)
  // AG Grid 的外部筛选回调读这个 ref，回调本身保持稳定
  const filterRef = useRef({ tagFilter, keySearch })

  const rowData = useMemo<RowRef[]>(
    () => Array.from({ length: result.keys.length }, (_, i) => ({ i })),
    [result],
  )

  const fieldHasDiff = useMemo(() => result.diff.map((col) => col.includes(1)), [result])

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
      headerName: t.statusCol,
      pinned: 'left',
      width: 150,
      cellRenderer: StatusCell,
      cellRendererParams: { result },
      sortable: false,
    }
    const fileGroups: ColGroupDef<RowRef>[] = result.files.map((file, f) => ({
      groupId: `file-${f}`,
      headerName: `${FILE_LETTERS[f]} · ${file.fileName}`,
      headerClass: 'mylb-file-group',
      children: result.fieldLabels.map<ColDef<RowRef>>((label, k) => ({
        colId: `v_${f}_${k}`,
        headerName: label,
        minWidth: 110,
        flex: 1,
        hide: onlyDiffColumns && !fieldHasDiff[k],
        valueGetter: (p) => (p.data ? result.values[f]?.[k]?.[p.data.i] : null),
        valueFormatter: (p) => (p.value == null ? t.missingCell : String(p.value)),
        cellClassRules: {
          'mylb-cell-missing': (p) => !!p.data && !(((result.presence[p.data.i] ?? 0) >> f) & 1),
          'mylb-cell-diff': (p) =>
            !!p.data &&
            ((result.presence[p.data.i] ?? 0) >> f) & 1 &&
            result.diff[k]?.[p.data.i] === 1
              ? true
              : false,
        },
      })),
    }))
    return [keyCol, statusCol, ...fileGroups]
  }, [result, onlyDiffColumns, fieldHasDiff])

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
      localeText={AG_GRID_LOCALE_CN}
      rowData={rowData}
      columnDefs={columnDefs}
      defaultColDef={{ sortable: true, resizable: true, suppressMovable: true }}
      getRowId={(p) => String(p.data.i)}
      isExternalFilterPresent={isExternalFilterPresent}
      doesExternalFilterPass={doesExternalFilterPass}
      suppressFieldDotNotation
      animateRows={false}
      onGridReady={(e) => {
        apiRef.current = e.api
        e.api.onFilterChanged()
        onVisibleCountChange?.(e.api.getDisplayedRowCount())
      }}
    />
  )
}
