import { AlertTriangleIcon, FileTextIcon, Loader2Icon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { t } from '../copy'
import { PREVIEW_LIMIT, useFileToMarkdownStore } from '../state/store'

/** 右侧主区域：选中文件的 Markdown 源码，等宽字体、只读、不做渲染预览 */
export function MarkdownPane() {
  const items = useFileToMarkdownStore((s) => s.items)
  const selectedId = useFileToMarkdownStore((s) => s.selectedId)
  const item = items.find((i) => i.id === selectedId) ?? null

  if (!item) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        <FileTextIcon className="size-8" />
        <p>{t.emptyPane}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-2" data-testid="markdown-pane">
      <h2 className="truncate text-sm font-medium" title={item.name}>
        {item.name}
      </h2>

      {(item.status === 'queued' || item.status === 'converting') && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border p-8 text-sm text-muted-foreground">
          <Loader2Icon className="size-6 animate-spin" />
          <p>{t.status[item.status]}</p>
        </div>
      )}

      {item.status === 'failed' && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertDescription>{item.error}</AlertDescription>
        </Alert>
      )}

      {item.status === 'done' && (
        <>
          {item.warnings.length > 0 && (
            <div className="space-y-1.5">
              {item.warnings.map((w) => (
                <Alert key={w}>
                  <AlertTriangleIcon />
                  <AlertDescription>{t.warnings[w]}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}
          <pre
            className="max-h-[65vh] overflow-auto rounded-xl border bg-muted/30 p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap lg:max-h-[calc(100svh-16rem)]"
            data-testid="markdown-content"
          >
            {(item.markdown ?? '').slice(0, PREVIEW_LIMIT)}
          </pre>
          {(item.markdown?.length ?? 0) > PREVIEW_LIMIT && <p className="text-xs text-muted-foreground">{t.truncated}</p>}
        </>
      )}
    </div>
  )
}
