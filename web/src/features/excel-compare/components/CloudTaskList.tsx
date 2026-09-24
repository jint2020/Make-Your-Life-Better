import { useEffect, useState } from 'react'
import { CloudIcon, Loader2Icon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatSize } from '@/lib/format'
import type { CloudTaskSummary } from '@/shared/api/client'
import { useAuth } from '@/shared/auth/store'
import { t } from '../copy'
import { deleteTask, listTasks, openTask } from '../cloud/cloud'

/** 上传步骤里的云端任务列表，只在登录后显示 */
export function CloudTaskList() {
  const status = useAuth((s) => s.status)
  if (status !== 'authenticated') return null
  return <CloudTaskListInner />
}

function CloudTaskListInner() {
  const [tasks, setTasks] = useState<CloudTaskSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    listTasks().then(setTasks, () => setError(t.cloud.loadFailed))
  }, [])

  const open = async (id: string) => {
    setBusyId(id)
    setError(null)
    try {
      const res = await openTask(id)
      if (!res.ok) setError(res.message)
    } catch {
      setError(t.cloud.openFailed)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string) => {
    setBusyId(id)
    setError(null)
    try {
      await deleteTask(id)
      setTasks((list) => list?.filter((x) => x.id !== id) ?? null)
    } catch {
      setError(t.cloud.openFailed)
    } finally {
      setBusyId(null)
      setConfirmId(null)
    }
  }

  return (
    <Card className="h-fit gap-4" data-testid="cloud-tasks">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudIcon className="size-4 text-primary" />
          {t.cloud.listTitle}
        </CardTitle>
        <CardDescription className="leading-relaxed">{t.cloud.listDesc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {tasks === null && !error && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
        {tasks?.length === 0 && <p className="text-sm text-muted-foreground">{t.cloud.empty}</p>}
        {tasks && tasks.length > 0 && (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li key={task.id} className="rounded-lg border px-3 py-2">
                <p className="truncate text-sm font-medium" title={task.name}>
                  {task.name}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {new Date(task.created_at).toLocaleString()} · {t.cloud.files(task.files.length)} ·{' '}
                  {formatSize(task.total_bytes)}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={busyId !== null} onClick={() => open(task.id)}>
                    {busyId === task.id && confirmId !== task.id && <Loader2Icon className="animate-spin" />}
                    {busyId === task.id && confirmId !== task.id ? t.cloud.opening : t.cloud.open}
                  </Button>
                  {confirmId === task.id ? (
                    <Button size="sm" variant="destructive" disabled={busyId !== null} onClick={() => remove(task.id)}>
                      {t.cloud.confirmDelete}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId !== null}
                      onClick={() => setConfirmId(task.id)}
                      aria-label={`${t.cloud.delete} ${task.name}`}
                    >
                      <Trash2Icon />
                      {t.cloud.delete}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
