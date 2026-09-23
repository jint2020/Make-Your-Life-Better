import { t } from '../copy'
import { TAG_DIFF, TAG_EQUAL, type CompareResult } from '../engine/types'
import { fileLetter } from '../grid/shared'

/** 一行的状态标签：全部一致 / 有差异 / 缺 X */
export function RowStatusBadges({ result, i }: { result: CompareResult; i: number }) {
  const tag = result.tags[i] ?? 0
  const presence = result.presence[i] ?? 0
  return (
    <span className="flex h-full items-center gap-1">
      {tag & TAG_EQUAL ? (
        <span className="rounded px-1.5 text-xs leading-5 text-diff-equal-fg">{t.result.summary.equal}</span>
      ) : null}
      {tag & TAG_DIFF ? (
        <span className="rounded bg-diff-changed-bg px-1.5 text-xs leading-5 text-diff-changed-fg">
          {t.result.summary.diff}
        </span>
      ) : null}
      {result.files.map((_, f) =>
        (presence >> f) & 1 ? null : (
          <span key={f} className="rounded bg-diff-missing-bg px-1.5 text-xs leading-5 text-diff-missing-fg">
            {t.result.missingIn(fileLetter(f))}
          </span>
        ),
      )}
    </span>
  )
}
