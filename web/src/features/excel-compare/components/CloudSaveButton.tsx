import { useState } from 'react'
import { CheckIcon, CloudUploadIcon, Loader2Icon } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/shared/auth/store'
import { t } from '../copy'
import { saveCurrentTask } from '../cloud/cloud'

/** 结果页的"保存到云端"。后端不可用时不显示；未登录时引导去登录 */
export function CloudSaveButton() {
  const status = useAuth((s) => s.status)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  if (status === 'loading' || status === 'unavailable') return null
  if (status === 'anonymous') {
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link to="/account">
          <CloudUploadIcon />
          {t.cloud.loginToSave}
        </Link>
      </Button>
    )
  }

  const save = async () => {
    setState('saving')
    setError(null)
    try {
      const res = await saveCurrentTask()
      if (res.ok) setState('saved')
      else {
        setError(res.message)
        setState('idle')
      }
    } catch {
      setError(t.cloud.openFailed)
      setState('idle')
    }
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button variant="outline" size="sm" disabled={state !== 'idle'} onClick={save}>
        {state === 'saving' ? <Loader2Icon className="animate-spin" /> : state === 'saved' ? <CheckIcon /> : <CloudUploadIcon />}
        {state === 'saving' ? t.cloud.saving : state === 'saved' ? t.cloud.saved : t.cloud.save}
      </Button>
    </span>
  )
}
