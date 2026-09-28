import { useState } from 'react'
import {
  CheckCircle2Icon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  Loader2Icon,
  RotateCcwIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { t } from '../copy'
import { formatCharCount, formatTokenCount } from '../state/counts'
import { markdownFileName } from '../state/queue'
import { useFileToMarkdownStore, type ConvertItem } from '../state/store'

function downloadItem(item: ConvertItem): void {
  if (item.markdown == null) return
  const blob = new Blob([item.markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = markdownFileName(item.name)
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function StatusIcon({ status }: { status: ConvertItem['status'] }) {
  switch (status) {
    case 'queued':
      return <ClockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    case 'converting':
      return <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
    case 'done':
      return <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-diff-equal-fg" />
    case 'failed':
      return <XCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
  }
}

export function FileListItem({ item }: { item: ConvertItem }) {
  const selected = useFileToMarkdownStore((s) => s.selectedId === item.id)
  const select = useFileToMarkdownStore((s) => s.select)
  const removeItem = useFileToMarkdownStore((s) => s.removeItem)
  const retryItem = useFileToMarkdownStore((s) => s.retryItem)
  const [copied, setCopied] = useState(false)

  const copyText = async () => {
    if (item.markdown == null) return
    try {
      await navigator.clipboard.writeText(item.markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板不可用（权限被拒绝等），静默失败
    }
  }

  return (
    <li
      className={cn(
        'overflow-hidden rounded-lg border bg-card transition-colors',
        selected && 'border-primary ring-1 ring-primary/30',
      )}
      data-testid="file-item"
      data-status={item.status}
    >
      <button
        type="button"
        onClick={() => select(item.id)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
      >
        <StatusIcon status={item.status} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-sm font-medium" title={item.name}>
            {item.name}
          </p>
          {item.status === 'done' ? (
            <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular-nums">
              <span>{formatCharCount(item.charCount ?? 0)}</span>
              <span title={t.tokenTooltip}>{formatTokenCount(item.tokenCount ?? 0)}</span>
            </p>
          ) : item.status === 'failed' ? (
            <p className="text-xs text-destructive">{item.error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{t.status[item.status]}</p>
          )}
        </div>
      </button>
      <div className="flex items-center gap-0.5 border-t px-1.5 py-1">
        {item.status === 'done' && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={copyText}
              aria-label={`${t.actions.copy} ${item.name}`}
            >
              {copied ? <CheckCircle2Icon className="text-diff-equal-fg" /> : <CopyIcon />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => downloadItem(item)}
              aria-label={`${t.actions.download} ${item.name}`}
            >
              <DownloadIcon />
            </Button>
          </>
        )}
        {item.status === 'failed' && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => retryItem(item.id)}
            aria-label={`${t.actions.retry} ${item.name}`}
          >
            <RotateCcwIcon />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-8"
          onClick={() => removeItem(item.id)}
          aria-label={`${t.actions.remove} ${item.name}`}
        >
          <XIcon />
        </Button>
      </div>
    </li>
  )
}
