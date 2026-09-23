import { Loader2Icon } from 'lucide-react'

import { copy } from '@/shared/copy/zh'

export function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" />
      {copy.app.loading}
    </div>
  )
}
