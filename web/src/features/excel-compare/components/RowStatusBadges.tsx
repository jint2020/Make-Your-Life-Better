import { t } from '../copy'
import { TAG_DIFF, TAG_EQUAL, type CompareResult } from '../engine/types'
import { fileLetter } from '../grid/shared'

/**
 * 一行的状态标签：全部一致 / 有差异 / 缺 X。
 * showFields：有差异时直接写出是哪些字段不一样（结果表的状态列用），扫一眼就知道要看哪几列
 */
export function RowStatusBadges({
  result,
  i,
  showFields = false,
}: {
  result: CompareResult
  i: number
  showFields?: boolean
}) {
  const tag = result.tags[i] ?? 0
  const presence = result.presence[i] ?? 0
  const diffText =
    showFields && tag & TAG_DIFF
      ? t.result.diffFields(result.fieldLabels.filter((_, k) => (result.diff[k]?.[i] ?? 0) !== 0))
      : t.result.summary.diff
  return (
    <span className="flex h-full min-w-0 items-center gap-1">
      {tag & TAG_EQUAL ? (
        <span className="rounded px-1.5 text-xs leading-5 text-diff-equal-fg">{t.result.summary.equal}</span>
      ) : null}
      {tag & TAG_DIFF ? (
        <span
          className="min-w-0 truncate rounded bg-diff-changed-bg px-1.5 text-xs leading-5 text-diff-changed-fg"
          title={diffText}
        >
          {diffText}
        </span>
      ) : null}
      {result.files.map((_, f) =>
        (presence >> f) & 1 ? null : (
          <span key={f} className="shrink-0 rounded bg-diff-missing-bg px-1.5 text-xs leading-5 text-diff-missing-fg">
            {t.result.missingIn(fileLetter(f))}
          </span>
        ),
      )}
    </span>
  )
}
