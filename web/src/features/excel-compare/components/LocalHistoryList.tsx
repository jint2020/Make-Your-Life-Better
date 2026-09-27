import { useState } from 'react'
import { HistoryIcon, Loader2Icon, Trash2Icon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime, formatSize } from '@/lib/format'
import { t } from '../copy'
import { clearLocalHistory, deleteLocalTask, openLocalTask, useLocalHistory } from '../history/localHistory'

/**
 * 上传步骤里的"本机历史"。还没有任何记录、而且能正常保存时不显示，免得第一次用的人多看一张空卡片
 */
export function LocalHistoryList() {
  const { ready, persistent, tasks, error: saveError } = useLocalHistory()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!ready || (tasks.length === 0 && persistent && !saveError)) return null

  const usage = tasks.reduce((sum, task) => sum + task.sizeBytes, 0)

  const open = async (id: string) => {
    setBusyId(id)
    setError(null)
    try {
      const res = await openLocalTask(id)
      if (!res.ok) setError(res.message)
    } catch {
      setError(t.history.openFailed)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string) => {
    setBusyId(id)
    try {
      await deleteLocalTask(id)
    } finally {
      setBusyId(null)
      setConfirmId(null)
    }
  }

  const clear = async () => {
    await clearLocalHistory()
    setConfirmClear(false)
  }

  return (
    <Card className="h-fit gap-4" data-testid="local-history">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon className="size-4 text-primary" />
          {t.history.title}
        </CardTitle>
        <CardDescription className="leading-relaxed">{t.history.desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!persistent && (
          <Alert>
            <AlertDescription>{t.history.notPersistent}</AlertDescription>
          </Alert>
        )}
        {(error ?? saveError) && <p className="text-sm text-destructive">{error ?? saveError}</p>}
        {tasks.length > 0 && (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li key={task.id} className="rounded-lg border px-3 py-2" data-testid="local-history-item">
                <p className="truncate text-sm font-medium" title={task.title}>
                  {task.title}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(task.updatedAt)} · {t.history.files(task.attachmentIds.length)} ·{' '}
                  {formatSize(task.sizeBytes)}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={busyId !== null} onClick={() => void open(task.id)}>
                    {busyId === task.id && confirmId !== task.id && <Loader2Icon className="animate-spin" />}
                    {busyId === task.id && confirmId !== task.id ? t.history.opening : t.history.open}
                  </Button>
                  {confirmId === task.id ? (
                    <Button size="sm" variant="destructive" disabled={busyId !== null} onClick={() => void remove(task.id)}>
                      {t.history.confirmDelete}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId !== null}
                      onClick={() => setConfirmId(task.id)}
                      aria-label={`${t.history.delete} ${task.title}`}
                    >
                      <Trash2Icon />
                      {t.history.delete}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {tasks.length > 0 && (
          <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{t.history.usage(formatSize(usage))}</span>
            {confirmClear ? (
              <Button size="sm" variant="destructive" className="h-7" onClick={() => void clear()}>
                {t.history.confirmClear}
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirmClear(true)}>
                {t.history.clear}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
