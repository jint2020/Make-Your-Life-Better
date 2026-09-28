import { useEffect } from 'react'
import { FileTextIcon, Loader2Icon, LogInIcon, TriangleAlertIcon } from 'lucide-react'
import { Link } from 'react-router'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/shared/auth/store'
import { t } from '../copy'
import { FileList } from '../components/FileList'
import { MarkdownPane } from '../components/MarkdownPane'
import { startFileToMarkdown } from '../state/store'

export function FileToMarkdownPage() {
  const status = useAuth((s) => s.status)

  // 只需要调用一次：注册"有结果时刷新/关闭要确认"，之后切到别的工具也继续生效
  useEffect(() => startFileToMarkdown(), [])

  return (
    <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-screen-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FileTextIcon className="size-6 text-primary" />
          {t.title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </header>

      {status === 'loading' && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {status === 'unavailable' && (
        <Alert data-testid="backend-unavailable">
          <TriangleAlertIcon />
          <AlertDescription>{t.unavailable.body}</AlertDescription>
        </Alert>
      )}

      {status === 'anonymous' && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>{t.anonymous.title}</CardTitle>
            <CardDescription className="leading-relaxed">{t.anonymous.body}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/account">
                <LogInIcon />
                {t.anonymous.cta}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {status === 'authenticated' && (
        <div className="flex flex-1 flex-col gap-4 lg:flex-row">
          <FileList />
          <MarkdownPane />
        </div>
      )}
    </div>
  )
}
