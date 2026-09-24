import { Loader2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { t } from '../copy'
import { useCompareStore } from '../state/store'
import { useCanRunCompare } from '../state/hooks'
import { FieldConfigPanel } from './FieldConfigPanel'

/** 结果页的"调整配置"抽屉：改完直接重新对比，不用回到向导 */
export function ConfigSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const comparing = useCompareStore((s) => s.comparing)
  const runCompare = useCompareStore((s) => s.runCompare)
  const canRun = useCanRunCompare()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle>{t.result.configTitle}</SheetTitle>
          <SheetDescription>{t.result.configDesc}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-auto px-4">
          <FieldConfigPanel />
        </div>
        <SheetFooter className="flex-row justify-end border-t">
          <Button
            disabled={!canRun}
            onClick={async () => {
              if (await runCompare()) onOpenChange(false)
            }}
          >
            {comparing && <Loader2Icon className="animate-spin" />}
            {comparing ? t.fields.running : t.fields.rerun}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
