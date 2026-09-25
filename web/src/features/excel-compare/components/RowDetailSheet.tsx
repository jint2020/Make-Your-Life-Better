import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { t } from '../copy'
import type { CompareResult } from '../engine/types'
import { RowStatusBadges } from './RowStatusBadges'
import { FileBadge } from './FileBadge'

/** 行详情："字段 × 文件"竖表，一眼看完一条记录在各文件里的情况 */
export function RowDetailSheet({
  result,
  rowIndex,
  onClose,
}: {
  result: CompareResult
  rowIndex: number | null
  onClose: () => void
}) {
  const i = rowIndex ?? 0
  const present = (f: number) => (((result.presence[i] ?? 0) >> f) & 1) === 1

  return (
    <Sheet open={rowIndex != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {t.detail.title}
            <span className="font-mono">{result.keys[i]}</span>
          </SheetTitle>
          <SheetDescription asChild>
            <div className="h-6">
              {rowIndex != null && <RowStatusBadges result={result} i={i} />}
            </div>
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-auto px-4 pb-6">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">{t.detail.field}</th>
                {result.files.map((f, idx) => (
                  <th key={f.fileId} className="px-2 py-2 font-medium">
                    <span className="flex items-center gap-1.5">
                      <FileBadge index={idx} />
                      <span className="max-w-36 truncate">{f.fileName}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-3 font-medium">{result.keyLabel}</td>
                {result.files.map((f, idx) => (
                  <td key={f.fileId} className={cn('px-2 py-2 font-mono', !present(idx) && 'text-diff-missing-fg')}>
                    {present(idx) ? result.keys[i] : t.detail.notInFile}
                  </td>
                ))}
              </tr>
              {result.displayLabels.map((label, k) => (
                <tr key={`d${k}`} className="border-b text-muted-foreground">
                  <td className="py-2 pr-3">{label}</td>
                  <td className="px-2 py-2" colSpan={result.files.length}>
                    {result.displayValues[k]?.[i] ?? '—'}
                  </td>
                </tr>
              ))}
              {result.fieldLabels.map((label, k) => {
                const mask = result.diff[k]?.[i] ?? 0
                const isDiff = mask !== 0
                return (
                  <tr key={label} className="border-b last:border-0">
                    <td className={cn('py-2 pr-3', isDiff && 'font-medium')}>{label}</td>
                    {result.files.map((f, idx) => {
                      const v = result.values[idx]?.[k]?.[i]
                      return (
                        <td
                          key={f.fileId}
                          className={cn(
                            'px-2 py-2',
                            !present(idx) && 'bg-diff-missing-bg text-diff-missing-fg',
                            // 3 个文件时只标出和多数不同的那个
                            present(idx) &&
                              ((mask >> idx) & 1) === 1 &&
                              'bg-diff-changed-bg font-medium text-diff-changed-fg',
                          )}
                        >
                          {present(idx) ? (v ?? '—') : '—'}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  )
}
