import { useState } from 'react'
import { SearchIcon, SlidersHorizontalIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { t } from '../../copy'
import type { CompareResult } from '../../engine/types'
import { ResultGrid, type TagFilter } from '../../grid/ResultGrid'
import { CloudSaveButton } from '../CloudSaveButton'
import { ConfigSheet } from '../ConfigSheet'
import { ExcludedSheet } from '../ExcludedSheet'
import { RowDetailSheet } from '../RowDetailSheet'
import { SummaryBar } from '../SummaryBar'

export function ResultStep({ result }: { result: CompareResult }) {
  const [tagFilter, setTagFilter] = useState<TagFilter>(result.summary.diff > 0 ? 'diff' : 'all')
  const [keySearch, setKeySearch] = useState('')
  const [onlyDiffColumns, setOnlyDiffColumns] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [excludedOpen, setExcludedOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<number | null>(null)

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
        <Label className="cursor-pointer">
          <Switch checked={onlyDiffColumns} onCheckedChange={setOnlyDiffColumns} />
          {t.result.onlyDiffColumns}
        </Label>
        <span className="text-xs text-muted-foreground">{t.result.rowHint}</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {t.result.elapsed(result.elapsedMs, result.summary.total)}
        </span>
        <CloudSaveButton />
        <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
          <SlidersHorizontalIcon />
          {t.result.adjust}
        </Button>
      </div>
      <div className="min-h-[420px] flex-1" data-testid="result-grid">
        <ResultGrid
          result={result}
          tagFilter={tagFilter}
          keySearch={keySearch}
          onlyDiffColumns={onlyDiffColumns}
          onRowClick={setDetailRow}
        />
      </div>

      <ConfigSheet open={configOpen} onOpenChange={setConfigOpen} />
      <ExcludedSheet result={result} open={excludedOpen} onOpenChange={setExcludedOpen} />
      <RowDetailSheet result={result} rowIndex={detailRow} onClose={() => setDetailRow(null)} />
    </div>
  )
}
