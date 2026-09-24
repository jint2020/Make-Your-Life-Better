import { RotateCcwIcon, FileSpreadsheetIcon, ShieldCheckIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { copy } from '@/shared/copy/zh'
import { t } from '../copy'
import { FieldStep } from '../components/steps/FieldStep'
import { ResultStep } from '../components/steps/ResultStep'
import { SheetStep } from '../components/steps/SheetStep'
import { UploadStep } from '../components/steps/UploadStep'
import { Stepper } from '../components/Stepper'
import { useCompareStore } from '../state/store'

export function ExcelComparePage() {
  const step = useCompareStore((s) => s.step)
  const result = useCompareStore((s) => s.result)
  const hasFiles = useCompareStore((s) => s.files.length > 0)
  const reset = useCompareStore((s) => s.reset)
  const isResult = step === 3 && result

  return (
    <div
      className={
        isResult
          ? 'mx-auto flex h-[calc(100svh-3.5rem)] max-w-screen-2xl flex-col gap-5 px-4 pt-6 pb-4 sm:px-6'
          : 'mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-screen-2xl flex-col gap-5 px-4 pt-6 sm:px-6'
      }
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FileSpreadsheetIcon className="size-6 text-primary" />
            {t.title}
          </h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheckIcon className="size-3.5 text-diff-equal-fg" />
          {copy.app.privacy}
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Stepper steps={t.steps} current={step} />
        {hasFiles && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcwIcon />
            {t.restart}
          </Button>
        )}
      </div>

      {step === 0 && <UploadStep />}
      {step === 1 && <SheetStep />}
      {step === 2 && <FieldStep />}
      {isResult && <ResultStep key={result.elapsedMs} result={result} />}
    </div>
  )
}
