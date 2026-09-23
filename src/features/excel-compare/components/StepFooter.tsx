import type { ReactNode } from 'react'

/** 每一步底部的操作栏：左边是提示，右边是按钮 */
export function StepFooter({ hint, children }: { hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      {hint && <div className="mr-auto text-sm text-muted-foreground">{hint}</div>}
      {children}
    </div>
  )
}
