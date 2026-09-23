import { useState } from 'react'
import { ArrowLeftIcon, ConstructionIcon, FileSpreadsheetIcon, Loader2Icon, ShieldCheckIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { copy } from '@/shared/copy/zh'
import type { CompareResult } from '../engine/types'
import { compareWorker } from '../worker/client'
import { ResultView } from '../components/ResultView'
import { Stepper } from '../components/Stepper'
import { t } from '../copy'

const RESULT_STEP = 3

export function ExcelComparePage() {
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<CompareResult | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  async function loadDemo(rows: number, files: 2 | 3) {
    const id = `${rows}-${files}`
    setLoading(id)
    try {
      const r = await compareWorker.api().generateDemo(rows, files)
      setResult(r)
      setStep(RESULT_STEP)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100svh-3.5rem)] max-w-screen-2xl flex-col gap-5 px-4 py-6 sm:px-6">
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
        {step > 0 && (
          <Button variant="outline" size="sm" onClick={() => setStep(step === RESULT_STEP ? 0 : step - 1)}>
            <ArrowLeftIcon />
            {step === RESULT_STEP ? t.restart : t.back}
          </Button>
        )}
      </div>

      {step === RESULT_STEP && result ? (
        <ResultView result={result} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ConstructionIcon className="size-4 text-muted-foreground" />
                {t.steps[step]} · {t.stepPlaceholder}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {t.stepPlans[step as 0 | 1 | 2]?.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.demoTitle}</CardTitle>
              <CardDescription className="leading-relaxed">{t.demoBody}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {(
                [
                  [10_000, 2, '1万'],
                  [100_000, 3, '10万'],
                  [300_000, 3, '30万'],
                ] as const
              ).map(([rows, files, label]) => (
                <Button
                  key={rows}
                  variant={rows === 100_000 ? 'default' : 'outline'}
                  disabled={loading !== null}
                  onClick={() => loadDemo(rows, files)}
                >
                  {loading === `${rows}-${files}` && <Loader2Icon className="animate-spin" />}
                  {loading === `${rows}-${files}` ? t.generating : t.demoButton(label, files)}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
