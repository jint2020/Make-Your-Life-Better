import { cn } from '@/lib/utils'
import { t } from '../copy'
import type { CompareSummary } from '../engine/types'
import type { TagFilter } from '../grid/ResultGrid'

type ChipId = TagFilter | 'excluded'

interface Chip {
  id: ChipId
  label: string
  count: number
  tone: string
}

export function SummaryBar({
  summary,
  value,
  onChange,
  onShowExcluded,
}: {
  summary: CompareSummary
  value: TagFilter
  onChange: (v: TagFilter) => void
  onShowExcluded: () => void
}) {
  const s = t.result.summary
  const chips: Chip[] = [
    { id: 'all', label: s.all, count: summary.total, tone: '' },
    { id: 'diff', label: s.diff, count: summary.diff, tone: 'bg-diff-changed-bg text-diff-changed-fg' },
    { id: 'missing', label: s.missing, count: summary.missing, tone: 'bg-diff-missing-bg text-diff-missing-fg' },
    { id: 'equal', label: s.equal, count: summary.equal, tone: 'text-diff-equal-fg' },
  ]
  const excluded: Chip[] = [
    { id: 'excluded', label: s.duplicateKey, count: summary.duplicateKey, tone: 'bg-diff-duplicate-bg text-diff-duplicate-fg' },
    { id: 'excluded', label: s.emptyKey, count: summary.emptyKey, tone: 'bg-diff-duplicate-bg text-diff-duplicate-fg' },
  ]

  const chip = (c: Chip, active: boolean, onClick: () => void) => (
    <button
      key={c.label}
      type="button"
      disabled={c.count === 0}
      onClick={onClick}
      aria-pressed={c.id === 'excluded' ? undefined : active}
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => chip(c, value === c.id, () => onChange(c.id as TagFilter)))}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      {excluded.map((c) => chip(c, false, onShowExcluded))}
      <span className="text-xs text-muted-foreground">{s.overlapHint}</span>
    </div>
  )
}
