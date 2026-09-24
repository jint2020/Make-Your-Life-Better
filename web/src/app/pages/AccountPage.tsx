import { useEffect, useState, type FormEvent } from 'react'
import { Loader2Icon, LogOutIcon, TriangleAlertIcon, UserRoundIcon } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatSize } from '@/lib/format'
import { cn } from '@/lib/utils'
import { api, errorMessage, type CloudUsage, type Me } from '@/shared/api/client'
import { useAuth } from '@/shared/auth/store'
import { copy } from '@/shared/copy/zh'

const c = copy.account

export function AccountPage() {
  const status = useAuth((s) => s.status)

  return (
    <div className="mx-auto w-full max-w-md space-y-4 px-4 py-10">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <UserRoundIcon className="size-6 text-primary" />
        {status === 'authenticated' ? c.title : c.loginTitle}
      </h1>
      {status === 'loading' && <Loader2Icon className="size-5 animate-spin text-muted-foreground" />}
      {status === 'unavailable' && (
        <Alert>
          <TriangleAlertIcon />
          <AlertDescription>{c.unavailable}</AlertDescription>
        </Alert>
      )}
      {status === 'anonymous' && <LoginCard />}
      {status === 'authenticated' && <AccountDetails />}
    </div>
  )
}

function LoginCard() {
  const [mode, setMode] = useState<'code' | 'password'>('code')

  return (
    <Card>
      <CardHeader>
        <CardDescription className="leading-relaxed">{c.loginDesc}</CardDescription>
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist">
          {(
            [
              ['code', c.byCode],
              ['password', c.byPassword],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                mode === value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>{mode === 'code' ? <CodeLoginForm /> : <PasswordLoginForm />}</CardContent>
    </Card>
  )
}

/** 登录成功后回到上一页（比如结果页）；直接打开的账号页就留在原地显示账号信息 */
function useAfterLogin() {
  const setUser = useAuth((s) => s.setUser)
  const navigate = useNavigate()
  const location = useLocation()
  return (user: Me) => {
    setUser(user)
    if (location.key !== 'default') void navigate(-1)
  }
}

function useCountdown() {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const timer = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [left])
  return [left, setLeft] as const
}

function CodeLoginForm() {
  const afterLogin = useAfterLogin()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'send' | 'login' | null>(null)
  const [countdown, setCountdown] = useCountdown()

  const send = async () => {
    setBusy('send')
    setError(null)
    try {
      const { error, response } = await api.POST('/api/auth/code', { body: { email } })
      if (response.ok) {
        setSentTo(email)
        setCountdown(60)
      } else setError(errorMessage(error, c.genericError))
    } catch {
      setError(c.genericError)
    } finally {
      setBusy(null)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy('login')
    setError(null)
    try {
      const { data, error } = await api.POST('/api/auth/login/code', { body: { email, code } })
      if (data) afterLogin(data)
      else setError(errorMessage(error, c.genericError))
    } catch {
      setError(c.genericError)
    } finally {
      setBusy(null)
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="login-email">{c.email}</Label>
        <div className="flex gap-2">
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            placeholder={c.emailPlaceholder}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={!email.includes('@') || countdown > 0 || busy !== null}
            onClick={send}
          >
            {busy === 'send' && <Loader2Icon className="animate-spin" />}
            {countdown > 0 ? c.resendIn(countdown) : c.sendCode}
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-code">{c.code}</Label>
        <Input
          id="login-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          placeholder={c.codePlaceholder}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
      </div>
      {sentTo && !error && <p className="text-sm text-muted-foreground">{c.codeSent(sentTo)}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={code.length !== 6 || busy !== null}>
        {busy === 'login' && <Loader2Icon className="animate-spin" />}
        {c.submitLogin}
      </Button>
      <p className="text-xs text-muted-foreground">{c.autoRegister}</p>
    </form>
  )
}

function PasswordLoginForm() {
  const afterLogin = useAfterLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { data, error } = await api.POST('/api/auth/login/password', { body: { email, password } })
      if (data) afterLogin(data)
      else setError(errorMessage(error, c.genericError))
    } catch {
      setError(c.genericError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="pw-email">{c.email}</Label>
        <Input
          id="pw-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          placeholder={c.emailPlaceholder}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw-password">{c.password}</Label>
        <Input
          id="pw-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2Icon className="animate-spin" />}
        {c.submitLogin}
      </Button>
      <p className="text-xs text-muted-foreground">{c.noPasswordHint}</p>
    </form>
  )
}

function AccountDetails() {
  const user = useAuth((s) => s.user)!
  const logout = useAuth((s) => s.logout)
  const refresh = useAuth((s) => s.refresh)
  const clear = useAuth((s) => s.clear)
  const [usage, setUsage] = useState<CloudUsage | null>(null)
  const [password, setPassword] = useState('')
  const [pwState, setPwState] = useState<{ busy: boolean; msg: string | null; error: boolean }>({
    busy: false,
    msg: null,
    error: false,
  })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    void api.GET('/api/cloud/usage').then(({ data }) => data && setUsage(data), () => {})
  }, [])

  const savePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPwState({ busy: true, msg: null, error: false })
    try {
      const { error, response } = await api.PUT('/api/auth/password', { body: { password } })
      if (response.ok) {
        setPassword('')
        setPwState({ busy: false, msg: c.passwordSaved, error: false })
        void refresh()
      } else setPwState({ busy: false, msg: errorMessage(error, c.genericError), error: true })
    } catch {
      setPwState({ busy: false, msg: c.genericError, error: true })
    }
  }

  const deleteAccount = async () => {
    setDeleteError(null)
    try {
      const { response } = await api.DELETE('/api/auth/account')
      if (response.ok) clear()
      else setDeleteError(c.genericError)
    } catch {
      setDeleteError(c.genericError)
    }
  }

  const percent = usage ? Math.min(100, (usage.used_bytes / usage.quota_bytes) * 100) : 0

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardDescription>{c.loggedInAs}</CardDescription>
          <CardTitle className="break-all" data-testid="account-email">
            {user.email}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{c.usageTitle}</span>
              {usage && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {c.tasks(usage.task_count, usage.max_tasks)}
                </span>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
            </div>
            {usage && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {c.usage(formatSize(usage.used_bytes), formatSize(usage.quota_bytes))}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            <LogOutIcon />
            {c.logout}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{c.passwordTitle(user.has_password)}</CardTitle>
          <CardDescription>{c.passwordDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={savePassword}>
            <Input
              type="password"
              autoComplete="new-password"
              aria-label={c.newPassword}
              placeholder={c.newPassword}
              minLength={8}
              maxLength={128}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {pwState.msg && (
              <p className={cn('text-sm', pwState.error ? 'text-destructive' : 'text-muted-foreground')}>{pwState.msg}</p>
            )}
            <Button type="submit" size="sm" disabled={pwState.busy || password.length < 8}>
              {pwState.busy && <Loader2Icon className="animate-spin" />}
              {c.savePassword}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">{c.dangerTitle}</CardTitle>
          <CardDescription>{c.dangerDesc}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {confirmDelete ? (
            <>
              <Button variant="destructive" size="sm" onClick={deleteAccount}>
                {c.confirmDelete}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                {c.cancel}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
              {c.deleteAccount}
            </Button>
          )}
          {deleteError && <p className="w-full text-sm text-destructive">{deleteError}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
