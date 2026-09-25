import { useRef, useState } from 'react'
import { DownloadIcon, Loader2Icon, SearchIcon, SlidersHorizontalIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { readLocal, writeLocal } from '@/shared/storage/local'
import { t } from '../../copy'
import type { CompareResult } from '../../engine/types'
import { downloadExport } from '../../export/download'
import { ResultGrid, type ColumnLayout, type TagFilter } from '../../grid/ResultGrid'
import { CloudSaveButton } from '../CloudSaveButton'
import { ConfigSheet } from '../ConfigSheet'
import { ExcludedSheet } from '../ExcludedSheet'
import { FileBadge } from '../FileBadge'
import { RowDetailSheet } from '../RowDetailSheet'
import { SummaryBar } from '../SummaryBar'

const LAYOUT_KEY = 'mylb.excelCompare.columnLayout'

export function ResultStep({ result }: { result: CompareResult }) {
  const [layout, setLayoutState] = useState<ColumnLayout>(() =>
    readLocal<ColumnLayout>(LAYOUT_KEY, 'field') === 'file' ? 'file' : 'field',
  )
  const setLayout = (value: ColumnLayout) => {
    setLayoutState(value)
    writeLocal(LAYOUT_KEY, value)
  }
  const [tagFilter, setTagFilter] = useState<TagFilter>(result.summary.diff > 0 ? 'diff' : 'all')
  const [keySearch, setKeySearch] = useState('')
  const [onlyDiffColumns, setOnlyDiffColumns] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [excludedOpen, setExcludedOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<number | null>(null)
  const [visibleCount, setVisibleCount] = useState(0)
  const displayedRowsRef = useRef<(() => Int32Array) | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // 导出范围跟随页面：当前筛选、排序后显示的行 + 当前的列设置
  const exportXlsx = async () => {
    const rows = displayedRowsRef.current?.()
    if (!rows) return
    setExporting(true)
    setExportError(null)
    try {
      const res = await downloadExport({ rows, layout, onlyDiffColumns })
      if (!res.ok) setExportError(res.message)
    } catch {
      setExportError(t.export.failed)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <SummaryBar
        summary={result.summary}
        value={tagFilter}
        onChange={setTagFilter}
        onShowExcluded={() => setExcludedOpen(true)}
      />
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-64">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keySearch}
            onChange={(e) => setKeySearch(e.target.value)}
            placeholder={t.result.keySearch}
            className="pl-8"
            aria-label={t.result.keySearch}
          />
        </div>
        <div className="flex gap-0.5 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label={t.result.layoutLabel}>
          {(
            [
              ['field', t.result.layoutByField],
              ['file', t.result.layoutByFile],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={layout === value}
              onClick={() => setLayout(value)}
              className={cn(
                'rounded-md px-2.5 py-1 text-sm transition-colors',
                layout === value
                  ? 'bg-background font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Label className="cursor-pointer">
          <Switch checked={onlyDiffColumns} onCheckedChange={setOnlyDiffColumns} />
          {t.result.onlyDiffColumns}
        </Label>
        <span className="text-xs text-muted-foreground">{t.result.rowHint}</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {t.result.elapsed(result.elapsedMs, result.summary.total)}
        </span>
        {exportError && <span className="text-xs text-destructive">{exportError}</span>}
        <Button
          variant="outline"
          size="sm"
          disabled={exporting || visibleCount === 0}
          title={t.export.hint(visibleCount)}
          onClick={() => void exportXlsx()}
        >
          {exporting ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
          {exporting ? t.export.exporting : t.export.button}
        </Button>
        <CloudSaveButton />
        <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
          <SlidersHorizontalIcon />
          {t.result.adjust}
        </Button>
      </div>
      {layout === 'field' && (
        <p
          className="-mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
          data-testid="file-legend"
        >
          {result.files.map((f, idx) => (
            <span key={f.fileId} className="flex min-w-0 items-center gap-1.5">
              <FileBadge index={idx} />
              <span className="max-w-64 truncate">{f.fileName}</span>
            </span>
          ))}
        </p>
      )}
      <div className="min-h-[420px] flex-1" data-testid="result-grid">
        <ResultGrid
          result={result}
          tagFilter={tagFilter}
          keySearch={keySearch}
          onlyDiffColumns={onlyDiffColumns}
          layout={layout}
          onRowClick={setDetailRow}
          onVisibleCountChange={setVisibleCount}
          displayedRowsRef={displayedRowsRef}
        />
      </div>

      <ConfigSheet open={configOpen} onOpenChange={setConfigOpen} />
      <ExcludedSheet result={result} open={excludedOpen} onOpenChange={setExcludedOpen} />
      <RowDetailSheet result={result} rowIndex={detailRow} onClose={() => setDetailRow(null)} />
    </div>
  )
}
