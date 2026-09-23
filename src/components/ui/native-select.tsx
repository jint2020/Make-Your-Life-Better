import * as React from 'react'
import { ChevronDownIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/** 原生 select：大量下拉（如字段映射表）时比弹出式 Select 轻量，也天然支持键盘和移动端 */
function NativeSelect({ className, size = 'default', ...props }: Omit<React.ComponentProps<'select'>, 'size'> & { size?: 'sm' | 'default' }) {
  return (
    <div className={cn('relative w-full min-w-0', className)} data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        className={cn(
          'w-full min-w-0 appearance-none truncate rounded-md border border-input bg-transparent pr-8 pl-2.5 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          size === 'sm' ? 'h-8' : 'h-9',
        )}
        {...props}
      />
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export { NativeSelect }
