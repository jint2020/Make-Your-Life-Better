import type { CustomCellRendererProps } from 'ag-grid-react'

import type { CompareResult } from '../engine/types'
import { TAG_DIFF, TAG_EQUAL } from '../engine/types'
import { t } from '../copy'
import { FILE_LETTERS, type RowRef } from './shared'


export function StatusCell(props: CustomCellRendererProps<RowRef> & { result: CompareResult }) {
  const { data, result } = props
  if (!data) return null
  const tag = result.tags[data.i] ?? 0
  const presence = result.presence[data.i] ?? 0

  return (
    <span className="flex h-full items-center gap-1">
      {tag & TAG_EQUAL ? (
        <span className="rounded px-1.5 text-xs leading-5 text-diff-equal-fg">{t.summary.equal}</span>
      ) : null}
      {tag & TAG_DIFF ? (
        <span className="rounded bg-diff-changed-bg px-1.5 text-xs leading-5 text-diff-changed-fg">
          {t.summary.diff}
        </span>
      ) : null}
      {result.files.map((_, f) =>
        (presence >> f) & 1 ? null : (
          <span key={f} className="rounded bg-diff-missing-bg px-1.5 text-xs leading-5 text-diff-missing-fg">
            {t.missingIn(FILE_LETTERS[f] ?? String(f + 1))}
          </span>
        ),
      )}
    </span>
  )
}
