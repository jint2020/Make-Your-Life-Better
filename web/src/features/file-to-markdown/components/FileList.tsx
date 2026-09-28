import { useRef, useState, type DragEvent } from 'react'
import { AlertTriangleIcon, ShieldCheckIcon, UploadIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { t } from '../copy'
import { grantConsent, hasConsent } from '../state/consent'
import { MAX_FILES } from '../state/queue'
import { useFileToMarkdownStore } from '../state/store'
import { ConsentDialog } from './ConsentDialog'
import { FileListItem } from './FileListItem'

const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.csv,.html,.htm,.epub'

/** 左侧：拖拽区 + 常驻提醒文案 + 文件列表 */
export function FileList() {
  const items = useFileToMarkdownStore((s) => s.items)
  const notice = useFileToMarkdownStore((s) => s.notice)
  const addFiles = useFileToMarkdownStore((s) => s.addFiles)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState<File[] | null>(null)
  const [consented, setConsented] = useState(() => hasConsent())
  const full = items.length >= MAX_FILES

  const submit = (incoming: File[]) => {
    if (incoming.length === 0) return
    if (consented) addFiles(incoming)
    else setPending(incoming)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (full) return
    submit(Array.from(e.dataTransfer.files))
  }

  return (
    <div className="flex flex-col gap-3 lg:w-80 lg:shrink-0" data-testid="file-list">
      <button
        type="button"
        disabled={full}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          if (!full) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm transition-colors',
          'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          dragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50 hover:bg-accent/40',
          full && 'cursor-not-allowed opacity-60 hover:border-border hover:bg-transparent',
        )}
      >
        <UploadIcon className="size-5 text-primary" />
        <span className="font-medium">{items.length > 0 ? t.dropMore : t.dropTitle}</span>
        {full ? (
          <span className="text-xs text-muted-foreground">{t.dropFull}</span>
        ) : items.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t.dropHint}</span>
        ) : null}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => {
          submit(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-diff-equal-fg" />
        {t.reminder}
      </p>

      {notice && (
        <Alert>
          <AlertTriangleIcon />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {items.length > 0 && (
        <ul className="max-h-[50vh] space-y-2 overflow-auto lg:max-h-[calc(100svh-22rem)]">
          {items.map((item) => (
            <FileListItem key={item.id} item={item} />
          ))}
        </ul>
      )}

      <ConsentDialog
        open={pending !== null}
        onConfirm={() => {
          grantConsent()
          setConsented(true)
          if (pending) addFiles(pending)
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
