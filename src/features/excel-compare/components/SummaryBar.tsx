import { cn } from '@/lib/utils'
import type { CompareSummary } from '../engine/types'
import type { TagFilter } from '../grid/ResultGrid'
import { t } from '../copy'

interface Chip {
  id: TagFilter | 'duplicateKey' | 'emptyKey'
  label: string
  count: number
  tone: string
}

export function SummaryBar({
  summary,
  value,
  onChange,
}: {
  summary: CompareSummary
  value: TagFilter
  onChange: (v: TagFilter) => void
}) {
  const chips: Chip[] = [
    { id: 'all', label: t.summary.all, count: summary.total, tone: '' },
    { id: 'diff', label: t.summary.diff, count: summary.diff, tone: 'bg-diff-changed-bg text-diff-changed-fg' },
    { id: 'missing', label: t.summary.missing, count: summary.missing, tone: 'bg-diff-missing-bg text-diff-missing-fg' },
    { id: 'equal', label: t.summary.equal, count: summary.equal, tone: 'text-diff-equal-fg' },
    { id: 'duplicateKey', label: t.summary.duplicateKey, count: summary.duplicateKey, tone: 'bg-diff-duplicate-bg text-diff-duplicate-fg' },
    { id: 'emptyKey', label: t.summary.emptyKey, count: summary.emptyKey, tone: 'bg-diff-duplicate-bg text-diff-duplicate-fg' },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => {
        // 主键重复 / 为空的行不在结果表里，后续会单独用一个列表展示
        const selectable = c.id !== 'duplicateKey' && c.id !== 'emptyKey'
        const active = value === c.id
        return (
          <button
            key={c.id}
            type="button"
            disabled={!selectable || c.count === 0}
            onClick={() => selectable && onChange(c.id as TagFilter)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              active ? 'border-primary ring-2 ring-primary/20' : 'hover:bg-accent',
            )}
          >
            <span>{c.label}</span>
            <span className={cn('rounded px-1.5 font-mono text-xs tabular-nums', c.tone || 'bg-muted')}>
              {c.count.toLocaleString()}
            </span>
          </button>
        )
      })}
      <span className="text-xs text-muted-foreground">{t.summary.overlapHint}</span>
    </div>
  )
}
