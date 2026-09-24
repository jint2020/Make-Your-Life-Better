import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { t } from '../copy'
import type { CompareResult } from '../engine/types'
import { fileLetter } from '../grid/shared'
import { FileBadge } from './FileBadge'

const MAX_ROWS = 2000

export function ExcludedSheet({
  result,
  open,
  onOpenChange,
}: {
  result: CompareResult
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const rows = result.excluded.slice(0, MAX_ROWS)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {t.excluded.title}（{result.excluded.length.toLocaleString()}）
          </SheetTitle>
          <SheetDescription>{t.excluded.desc}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-auto px-4 pb-4">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">{t.excluded.file}</th>
                <th className="py-2 pr-3 font-medium">{t.excluded.row}</th>
                <th className="py-2 pr-3 font-medium">{t.excluded.key}</th>
                <th className="py-2 font-medium">{t.excluded.reason}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1.5 pr-3">
                    <FileBadge index={e.fileIndex} />
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{e.rowNumber}</td>
                  <td className="py-1.5 pr-3 font-mono">{e.keyText || '—'}</td>
                  <td className="py-1.5">
                    <span className="rounded bg-diff-duplicate-bg px-1.5 py-0.5 text-xs text-diff-duplicate-fg">
                      {e.reason === 'empty-key'
                        ? t.excluded.emptyKey
                        : t.excluded.duplicateIn((e.duplicateIn ?? []).map(fileLetter).join('、'))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.excluded.length > MAX_ROWS && (
            <p className="pt-3 text-center text-xs text-muted-foreground">
              {t.excluded.more(result.excluded.length - MAX_ROWS)}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
