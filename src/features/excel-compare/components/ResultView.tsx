import { useState } from 'react'
import { SearchIcon } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { CompareResult } from '../engine/types'
import { ResultGrid, type TagFilter } from '../grid/ResultGrid'
import { t } from '../copy'
import { SummaryBar } from './SummaryBar'

export function ResultView({ result }: { result: CompareResult }) {
  const [tagFilter, setTagFilter] = useState<TagFilter>('diff')
  const [keySearch, setKeySearch] = useState('')
  const [onlyDiffColumns, setOnlyDiffColumns] = useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <SummaryBar summary={result.summary} value={tagFilter} onChange={setTagFilter} />
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-64">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keySearch}
            onChange={(e) => setKeySearch(e.target.value)}
            placeholder={t.keySearch}
            className="pl-8"
            aria-label={t.keySearch}
          />
        </div>
        <Label className="cursor-pointer">
          <Switch checked={onlyDiffColumns} onCheckedChange={setOnlyDiffColumns} />
          {t.onlyDiffColumns}
        </Label>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {t.elapsed(result.elapsedMs, result.summary.total)}
        </span>
      </div>
      <div className="min-h-[420px] flex-1" data-testid="result-grid">
        <ResultGrid
          result={result}
          tagFilter={tagFilter}
          keySearch={keySearch}
          onlyDiffColumns={onlyDiffColumns}
        />
      </div>
    </div>
  )
}
