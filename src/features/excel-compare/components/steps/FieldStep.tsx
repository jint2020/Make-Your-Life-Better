import { Loader2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { t } from '../../copy'
import { useCompareStore } from '../../state/store'
import { useCanRunCompare } from '../../state/hooks'
import { FieldConfigPanel } from '../FieldConfigPanel'
import { StepFooter } from '../StepFooter'

export function FieldStep() {
  const goTo = useCompareStore((s) => s.goTo)
  const comparing = useCompareStore((s) => s.comparing)
  const runCompare = useCompareStore((s) => s.runCompare)
  const canRun = useCanRunCompare()

  return (
    <div className="flex flex-1 flex-col gap-4">
      <FieldConfigPanel />
      <div className="flex-1" />
      <StepFooter>
        <Button variant="outline" onClick={() => goTo(1)}>
          {t.prev}
        </Button>
        <Button disabled={!canRun} onClick={() => void runCompare()}>
          {comparing && <Loader2Icon className="animate-spin" />}
          {comparing ? t.fields.running : t.fields.run}
        </Button>
      </StepFooter>
    </div>
  )
}
