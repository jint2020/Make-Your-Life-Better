import { useState } from 'react'
import { AlertTriangleIcon, CheckCircle2Icon, ChevronDownIcon, ChevronUpIcon, Loader2Icon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import { t } from '../../copy'
import type { CsvEncoding } from '../../parse/encoding'
import { columnLetter } from '../../parse/headers'
import { canLeaveSheets, useCompareStore, type SourceFile } from '../../state/store'
import { FileBadge } from '../FileBadge'
import { StepFooter } from '../StepFooter'

const MAX_PREVIEW_COLS = 30
const SUMMARY_COLS = 6

/** 表头那一行的前几个非空单元格；表头不在预览范围里时返回 null */
function headerCells(file: SourceFile): string[] | null {
  const row = file.headerRow == null ? undefined : file.sheetInfo?.preview[file.headerRow - 1]
  if (!row) return null
  return row.filter((c) => c != null && c.trim() !== '')
}

function SheetPreview({ file }: { file: SourceFile }) {
  const setHeaderRow = useCompareStore((s) => s.setHeaderRow)
  const info = file.sheetInfo
  if (!info) return null
  const cols = Math.min(info.colCount, MAX_PREVIEW_COLS)
  const header = file.headerRow ?? 1

  return (
    <div className="max-h-80 overflow-auto rounded-md border text-sm">
      <table className="w-max min-w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 w-12 border-r border-b bg-muted px-2 py-1" />
            {Array.from({ length: cols }, (_, c) => (
              <th key={c} className="border-b px-2 py-1 font-normal">
                {columnLetter(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {info.preview.map((row, r) => {
            const rowNo = r + 1
            const isHeader = rowNo === header
            const above = rowNo < header
            return (
              <tr
                key={r}
                className={cn(
                  isHeader && 'bg-primary/10 font-medium',
                  above && 'text-muted-foreground/50',
                )}
              >
                <td className="sticky left-0 border-r bg-background p-0 text-center text-xs">
                  <button
                    type="button"
                    onClick={() => setHeaderRow(file.fileId, rowNo)}
                    className={cn(
                      'h-full w-full px-2 py-1 tabular-nums hover:bg-accent',
                      isHeader ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'text-muted-foreground',
                    )}
                    aria-label={`把第 ${rowNo} 行设为表头`}
                  >
                    {rowNo}
                  </button>
                </td>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className="max-w-48 truncate border-b border-l border-border/50 px-2 py-1">
                    {row[c]}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * 折叠时的一行摘要：工作表 · 表头第几行 · 表头前几列。
 * 大多数时候自动识别是对的，看一眼摘要就能确认，不用滚过整页预览
 */
function SheetSummary({ file }: { file: SourceFile }) {
  const cells = headerCells(file)
  const auto = file.headerRow === file.sheetInfo?.suggestedHeaderRow
  const parts = [
    file.kind === 'csv' ? t.upload.csv(file.encoding) : file.sheetName,
    file.kind === 'xlsx' && file.sheetNames.length > 1 ? t.sheet.summarySheets(file.sheetNames.length) : null,
    file.headerRow != null ? t.sheet.summaryHeaderRow(file.headerRow) : null,
  ].filter(Boolean)
  return (
    <div className="min-w-0 space-y-1 text-sm" data-testid="sheet-summary">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CheckCircle2Icon className="size-4 shrink-0 text-diff-equal-fg" />
        <span>{parts.join(' · ')}</span>
        <span className="text-xs text-muted-foreground">{auto ? t.sheet.summaryAuto : t.sheet.summaryManual}</span>
      </p>
      {cells && cells.length > 0 && (
        <p className="truncate pl-6 text-muted-foreground" title={cells.join('、')}>
          {t.sheet.summaryColumns(
            cells.slice(0, SUMMARY_COLS).join('、') + (cells.length > SUMMARY_COLS ? '…' : ''),
          )}
        </p>
      )}
    </div>
  )
}

function FileSheetCard({ file, index }: { file: SourceFile; index: number }) {
  const setSheet = useCompareStore((s) => s.setSheet)
  const setHeaderRow = useCompareStore((s) => s.setHeaderRow)
  const setEncoding = useCompareStore((s) => s.setEncoding)
  const id = file.fileId

  // 默认折叠成摘要；出错或者表头行是空的，自动展开让用户处理。用户手动展开 / 收起后以用户为准
  const [open, setOpen] = useState<boolean | null>(null)
  const cells = headerCells(file)
  const headerEmpty = !!file.sheetInfo && cells != null && cells.length === 0
  const needsAttention = !!(file.sheetError || file.tableError) || headerEmpty
  const expanded = open ?? needsAttention

  return (
    <Card className="gap-4 py-5" data-testid="sheet-card">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileBadge index={index} />
          <span className="truncate">{file.name}</span>
          {file.sheetInfo && (
            <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">
              {t.sheet.rows(file.sheetInfo.rowCount)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        {!expanded && (
          <div className="flex items-start justify-between gap-4">
            {file.sheetLoading || !file.sheetInfo ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                {t.sheet.loading}
              </p>
            ) : (
              <SheetSummary file={file} />
            )}
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setOpen(true)}>
              <ChevronDownIcon />
              {t.sheet.adjust}
            </Button>
          </div>
        )}
        {expanded && (
          <>
            <div className="flex flex-wrap items-end gap-4">
              {file.kind === 'xlsx' && (
                <div className="grid w-56 gap-1.5">
                  <Label htmlFor={`${id}-sheet`}>{t.sheet.sheet}</Label>
                  <NativeSelect
                    id={`${id}-sheet`}
                    value={file.sheetName ?? ''}
                    onChange={(e) => setSheet(id, e.target.value)}
                    disabled={file.sheetLoading}
                  >
                    {file.sheetNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              )}
              {file.kind === 'csv' && (
                <div className="grid w-56 gap-1.5">
                  <Label htmlFor={`${id}-enc`}>{t.sheet.encoding}</Label>
                  <NativeSelect
                    id={`${id}-enc`}
                    value={file.encodingMode}
                    onChange={(e) => setEncoding(id, e.target.value as 'auto' | CsvEncoding)}
                    disabled={file.sheetLoading}
                  >
                    <option value="auto">{t.sheet.encodingAuto(file.encoding)}</option>
                    <option value="utf-8">UTF-8</option>
                    <option value="gb18030">GBK / GB18030</option>
                  </NativeSelect>
                </div>
              )}
              <div className="grid w-32 gap-1.5">
                <Label htmlFor={`${id}-header`}>{t.sheet.headerRow}</Label>
                <Input
                  id={`${id}-header`}
                  type="number"
                  min={1}
                  max={file.sheetInfo?.rowCount ?? 1}
                  value={file.headerRow ?? ''}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isInteger(n) && n >= 1) setHeaderRow(id, n)
                  }}
                  disabled={file.sheetLoading || !file.sheetInfo}
                />
              </div>
              <p className="pb-2 text-xs text-muted-foreground">{t.sheet.previewHint}</p>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setOpen(false)}>
                <ChevronUpIcon />
                {t.sheet.collapse}
              </Button>
            </div>

            {file.sheetLoading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                {t.sheet.loading}
              </p>
            )}
            {(file.sheetError || file.tableError) && (
              <Alert variant="destructive">
                <AlertTriangleIcon />
                <AlertDescription>{file.sheetError ?? file.tableError}</AlertDescription>
              </Alert>
            )}
            {headerEmpty && !file.sheetError && (
              <Alert>
                <AlertTriangleIcon />
                <AlertDescription>{t.sheet.headerEmpty}</AlertDescription>
              </Alert>
            )}
            {!file.sheetLoading && <SheetPreview file={file} />}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function SheetStep() {
  const files = useCompareStore((s) => s.files)
  const extracting = useCompareStore((s) => s.extracting)
  const extractAll = useCompareStore((s) => s.extractAll)
  const goTo = useCompareStore((s) => s.goTo)

  return (
    <div className="flex flex-1 flex-col gap-4">
      {files.map((f, i) => (
        <FileSheetCard key={f.fileId} file={f} index={i} />
      ))}
      <div className="flex-1" />
      <StepFooter>
        <Button variant="outline" onClick={() => goTo(0)}>
          {t.prev}
        </Button>
        <Button disabled={!canLeaveSheets(files) || extracting} onClick={() => void extractAll()}>
          {extracting && <Loader2Icon className="animate-spin" />}
          {extracting ? t.sheet.extracting : t.next}
        </Button>
      </StepFooter>
    </div>
  )
}
