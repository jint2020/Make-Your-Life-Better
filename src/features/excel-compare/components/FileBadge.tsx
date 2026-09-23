import { cn } from '@/lib/utils'
import { fileLetter } from '../grid/shared'

/** 文件代号小方块：A / B / C */
export function FileBadge({ index, className }: { index: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded bg-primary/10 font-mono text-xs font-semibold text-primary',
        className,
      )}
    >
      {fileLetter(index)}
    </span>
  )
}
