import { Link, NavLink, Outlet, useNavigation } from 'react-router'
import { SparklesIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { copy } from '@/shared/copy/zh'
import { ThemeMenu } from '@/shared/theme/ThemeMenu'
import { TOOLS } from '@/tools.registry'

export function AppShell() {
  const navigation = useNavigation()
  const isLoading = navigation.state === 'loading'

  return (
    <div className="flex min-h-svh flex-col">
      {/* 懒加载路由时的顶部进度条 */}
      <div
        aria-hidden
        className={cn(
          'fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary transition-transform duration-500',
          isLoading ? 'scale-x-75' : 'scale-x-0',
        )}
      />
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <SparklesIcon className="size-4" />
            </span>
            <span className="hidden sm:inline">{copy.app.name}</span>
            <span className="sm:hidden">{copy.app.shortName}</span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto text-sm">
            {TOOLS.map((tool) => (
              <NavLink
                key={tool.id}
                to={`/${tool.path}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                    isActive && 'bg-accent text-accent-foreground',
                  )
                }
              >
                <tool.icon className="size-4" />
                {tool.name}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto">
            <ThemeMenu />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
