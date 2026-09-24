import { useRef, useState, type DragEvent } from 'react'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FileSpreadsheetIcon,
  FileTextIcon,
  Loader2Icon,
  UploadIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatSize } from '@/lib/format'
import { cn } from '@/lib/utils'
import { t } from '../../copy'
import {
  canLeaveUpload,
  LARGE_FILE_BYTES,
  MAX_FILES,
  MIN_FILES,
  useCompareStore,
  type SourceFile,
} from '../../state/store'
import { CloudTaskList } from '../CloudTaskList'
import { FileBadge } from '../FileBadge'
import { StepFooter } from '../StepFooter'

function FileRow({ file, index }: { file: SourceFile; index: number }) {
  const removeFile = useCompareStore((s) => s.removeFile)
  const Icon = file.name.toLowerCase().endsWith('.csv') ? FileTextIcon : FileSpreadsheetIcon

  return (
    <li className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3" data-testid="file-row">
      <FileBadge index={index} className="mt-0.5" />
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate font-medium">{file.name}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{formatSize(file.size)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          {file.status === 'inspecting' && (
            <>
              <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">{t.upload.inspecting}</span>
            </>
          )}
          {file.status === 'ready' && (
            <>
              <CheckCircle2Icon className="size-3.5 text-diff-equal-fg" />
              <span className="text-muted-foreground">
                {file.kind === 'csv' ? t.upload.csv(file.encoding) : t.upload.sheets(file.sheetNames.length)}
              </span>
            </>
          )}
          {file.status === 'error' && (
            <>
              <XCircleIcon className="size-3.5 shrink-0 text-destructive" />
              <span className="text-destructive">{file.error}</span>
            </>
          )}
        </div>
        {file.size > LARGE_FILE_BYTES && file.status !== 'error' && (
          <p className="flex items-center gap-1.5 text-xs text-diff-changed-fg">
            <AlertTriangleIcon className="size-3.5" />
            {t.upload.large}
          </p>
        )}
      </div>
      <Button variant="ghost" size="icon" className="size-8" onClick={() => removeFile(file.fileId)} aria-label={`${t.upload.remove} ${file.name}`}>
        <XIcon />
      </Button>
    </li>
  )
}

export function UploadStep() {
  const files = useCompareStore((s) => s.files)
  const notice = useCompareStore((s) => s.notice)
  const addFiles = useCompareStore((s) => s.addFiles)
  const loadSample = useCompareStore((s) => s.loadSample)
  const goTo = useCompareStore((s) => s.goTo)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [sampleLoading, setSampleLoading] = useState<number | null>(null)

  const full = files.length >= MAX_FILES
  const canNext = canLeaveUpload(files)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (full) return
    addFiles(Array.from(e.dataTransfer.files))
  }

  const sample = async (rows: number) => {
    setSampleLoading(rows)
    try {
      await loadSample(rows, 3)
    } finally {
      setSampleLoading(null)
    }
  }

  let hint: string | null = null
  if (files.length < MIN_FILES) hint = t.upload.needMore(MIN_FILES - files.length)
  else if (files.some((f) => f.status === 'error')) hint = t.upload.fixErrors
  else if (files.some((f) => f.status === 'inspecting')) hint = t.upload.waitParsing

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
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
              'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
              'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              dragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50 hover:bg-accent/40',
              full && 'cursor-not-allowed opacity-60 hover:border-border hover:bg-transparent',
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UploadIcon className="size-5" />
            </span>
            <span className="font-medium">{full ? t.upload.dropFull : t.upload.dropTitle}</span>
            {!full && <span className="text-sm text-muted-foreground">{t.upload.dropHint}</span>}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            multiple
            hidden
            data-testid="file-input"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />

          {notice && (
            <Alert>
              <AlertTriangleIcon />
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}

          {files.length > 0 && (
            <ul className="space-y-2">
              {files.map((f, i) => (
                <FileRow key={f.fileId} file={f} index={i} />
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <CloudTaskList />
          <Card className="h-fit gap-4">
            <CardHeader>
              <CardTitle>{t.upload.sampleTitle}</CardTitle>
              <CardDescription className="leading-relaxed">{t.upload.sampleBody}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {(
                [
                  [1_000, t.upload.sampleSmall],
                  [100_000, t.upload.samplePerf],
                ] as const
              ).map(([rows, label]) => (
                <Button key={rows} variant="outline" disabled={sampleLoading !== null} onClick={() => sample(rows)}>
                  {sampleLoading === rows && <Loader2Icon className="animate-spin" />}
                  {sampleLoading === rows ? t.upload.sampleLoading : label}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex-1" />
      <StepFooter hint={hint}>
        <Button disabled={!canNext} onClick={() => goTo(1)}>
          {t.next}
        </Button>
      </StepFooter>
    </div>
  )
}
