import { isRouteErrorResponse, useRouteError } from 'react-router'

import { Button } from '@/components/ui/button'
import { copy } from '@/shared/copy/zh'

export function RouteError() {
  const error = useRouteError()
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error)

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">{copy.app.errorTitle}</h1>
      <p className="text-sm text-muted-foreground">{copy.app.errorBody}</p>
      <pre className="max-w-full overflow-auto rounded-md bg-muted px-3 py-2 text-left text-xs">{detail}</pre>
      <Button onClick={() => window.location.reload()}>{copy.app.reload}</Button>
    </div>
  )
}
