import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon, Undo2Icon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { t } from '../copy'
import type { NormalizeOptions } from '../engine/types'
import { validateFieldRows, type BulkRole, type FieldRole, type FieldRow } from '../state/fields'
import { useCompareStore } from '../state/store'
import { FileBadge } from './FileBadge'

const ROLE_ORDER: FieldRole[] = ['key', 'compare', 'display', 'ignore']
const BULK_ROLES: BulkRole[] = ['compare', 'display', 'ignore']

const ROLE_ROW_CLASS: Record<FieldRole, string> = {
  key: 'bg-primary/5',
  compare: '',
  display: '',
  ignore: 'text-muted-foreground',
}

/** 各文件：列名 → 示例值 */
type SamplesByFile = Map<string, string[]>[]

function FieldRowView({ row, headers, samples }: { row: FieldRow; headers: string[][]; samples: SamplesByFile }) {
  const updateField = useCompareStore((s) => s.updateField)
  const updateFieldColumn = useCompareStore((s) => s.updateFieldColumn)
  const keyMissing = row.role === 'key' && row.columns.some((c) => c == null)

  return (
    <tr className={cn('border-b last:border-0', ROLE_ROW_CLASS[row.role])} data-testid="field-row">
      <td className="px-3 py-2 align-top leading-8 font-medium whitespace-nowrap">{row.label}</td>
      <td className="px-3 py-2 align-top">
        <NativeSelect
          size="sm"
          className="w-24"
          value={row.role}
          aria-label={`${row.label} 的用途`}
          onChange={(e) => updateField(row.id, { role: e.target.value as FieldRole })}
        >
          {ROLE_ORDER.map((r) => (
            <option key={r} value={r}>
              {t.fields.roles[r]}
            </option>
          ))}
        </NativeSelect>
      </td>
      {headers.map((cols, f) => {
        const col = row.columns[f]
        const examples = col == null ? [] : (samples[f]?.get(col) ?? [])
        return (
          <td key={f} className="px-3 py-2 align-top">
            <NativeSelect
              size="sm"
              // "（无）"：这个文件没有这个字段，用虚线框和灰色斜体和正常选项区分开
              className={cn('min-w-36', col == null && 'border-dashed text-muted-foreground italic')}
              value={col ?? ''}
              aria-label={`${row.label} 在文件 ${f + 1} 中对应的列`}
              aria-invalid={keyMissing && row.columns[f] == null}
              onChange={(e) => updateFieldColumn(row.id, f, e.target.value || null)}
            >
              <option value="">{t.fields.none}</option>
              {cols.map((c) => (
                <option key={c} value={c} className="text-foreground not-italic">
                  {c}
                </option>
              ))}
            </NativeSelect>
            {examples.length > 0 && (
              <p
                className="mt-1 max-w-56 truncate text-xs text-muted-foreground"
                title={examples.join('、')}
                aria-label={t.fields.samplesLabel(col!)}
                data-testid="field-samples"
              >
                {examples.join('、')}
              </p>
            )}
          </td>
        )
      })}
    </tr>
  )
}

/** "用途"列表头：把所有非主键字段一次设成同一个用途 */
function BulkRoleSelect() {
  const bulkSetRole = useCompareStore((s) => s.bulkSetRole)
  return (
    <NativeSelect
      size="sm"
      className="w-32 font-normal text-foreground"
      value=""
      aria-label={t.fields.bulkLabel}
      title={t.fields.bulkLabel}
      onChange={(e) => {
        if (e.target.value) bulkSetRole(e.target.value as BulkRole)
      }}
    >
      <option value="" disabled>
        {t.fields.bulkPlaceholder}
      </option>
      {BULK_ROLES.map((r) => (
        <option key={r} value={r}>
          {t.fields.roles[r]}
        </option>
      ))}
    </NativeSelect>
  )
}

function BulkNotice() {
  const lastBulk = useCompareStore((s) => s.lastBulk)
  const undoBulk = useCompareStore((s) => s.undoBulk)
  if (!lastBulk) return null
  const { applied, keptKeys, skippedSingle } = lastBulk.result
  return (
    <div
      role="status"
      data-testid="bulk-notice"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm"
    >
      <CheckCircle2Icon className="size-4 shrink-0 text-diff-equal-fg" />
      <span className="flex-1">
        {t.fields.bulkDone(applied, t.fields.roles[lastBulk.role], keptKeys, skippedSingle)}
      </span>
      <Button variant="outline" size="sm" className="h-7" onClick={undoBulk}>
        <Undo2Icon />
        {t.fields.undo}
      </Button>
    </div>
  )
}

function NormalizeOptionsView() {
  const normalize = useCompareStore((s) => s.normalize)
  const setNormalize = useCompareStore((s) => s.setNormalize)
  const items: { key: keyof NormalizeOptions; label: string; hint?: string }[] = [
    { key: 'keepLeadingZeros', label: t.fields.keepLeadingZeros, hint: t.fields.keepLeadingZerosHint },
    { key: 'ignoreCase', label: t.fields.ignoreCase },
    { key: 'fullToHalf', label: t.fields.fullToHalf },
  ]
  return (
    <section className="space-y-3">
      <h3 className="font-medium">{t.fields.normalizeTitle}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{t.fields.normalizeDefault}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {items.map((it) => (
          <Label key={it.key} className="cursor-pointer font-normal">
            <Switch checked={normalize[it.key]} onCheckedChange={(v) => setNormalize({ [it.key]: v })} />
            <span>
              {it.label}
              {it.hint && <span className="ml-1.5 text-xs text-muted-foreground">{it.hint}</span>}
            </span>
          </Label>
        ))}
      </div>
    </section>
  )
}

/** 字段映射 + 比较规则。第 3 步和结果页的"调整配置"抽屉共用 */
export function FieldConfigPanel() {
  const files = useCompareStore((s) => s.files)
  const fieldRows = useCompareStore((s) => s.fieldRows)
  const compareError = useCompareStore((s) => s.compareError)
  const headers = files.map((f) => f.table?.headers ?? [])
  const samples: SamplesByFile = files.map(
    (f) => new Map(f.table?.headers.map((h, c) => [h, f.table?.samples[c] ?? []]) ?? []),
  )
  const { errors, hints } = validateFieldRows(fieldRows)

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="font-medium">{t.fields.title}</h3>
          <p className="text-sm text-muted-foreground">
            {t.fields.desc}
          </p>
          <details className="text-xs text-muted-foreground">
            <summary className="w-fit cursor-pointer select-none hover:text-foreground">{t.fields.roleHelpTitle}</summary>
            <ul className="mt-1 space-y-0.5 pl-4">
              {t.fields.roleHelp.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t.fields.colField}</th>
                <th className="px-3 py-1.5 font-medium">
                  <BulkRoleSelect />
                </th>
                {files.map((f, i) => (
                  <th key={f.fileId} className="px-3 py-2 font-medium">
                    <span className="flex items-center gap-1.5">
                      <FileBadge index={i} />
                      <span className="max-w-40 truncate">{f.name}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fieldRows.map((row) => (
                <FieldRowView key={row.id} row={row} headers={headers} samples={samples} />
              ))}
            </tbody>
          </table>
        </div>
        <BulkNotice />
        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertDescription>
              {errors.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </AlertDescription>
          </Alert>
        )}
        {errors.length === 0 && hints.length > 0 && (
          <Alert>
            <InfoIcon />
            <AlertDescription>
              {hints.map((h) => (
                <p key={h}>{h}</p>
              ))}
            </AlertDescription>
          </Alert>
        )}
      </section>

      <NormalizeOptionsView />

      {compareError && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertDescription>{compareError}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
