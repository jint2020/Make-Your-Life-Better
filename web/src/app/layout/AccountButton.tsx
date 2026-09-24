import { UserRoundIcon } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/shared/auth/store'
import { copy } from '@/shared/copy/zh'

/** 顶栏的账号入口。后端不可用时不显示 */
export function AccountButton() {
  const status = useAuth((s) => s.status)
  const user = useAuth((s) => s.user)

  if (status === 'loading' || status === 'unavailable') return null
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link to="/account" data-testid="account-button">
        <UserRoundIcon />
        <span className="hidden max-w-40 truncate sm:inline">
          {status === 'authenticated' ? user?.email : copy.account.login}
        </span>
      </Link>
    </Button>
  )
}
