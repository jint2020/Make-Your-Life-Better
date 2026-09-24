import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { copy } from '@/shared/copy/zh'

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
      <p className="text-5xl font-semibold text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">{copy.app.notFoundTitle}</h1>
      <p className="text-sm text-muted-foreground">{copy.app.notFoundBody}</p>
      <Button asChild className="mt-2">
        <Link to="/">{copy.app.backHome}</Link>
      </Button>
    </div>
  )
}
