import { Link } from 'react-router'
import { ArrowRightIcon, ShieldCheckIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { copy } from '@/shared/copy/zh'
import { TOOLS } from '@/tools.registry'

export function HomePage() {
  return (
    <div className="mx-auto max-w-screen-xl px-4 py-10 sm:px-6 sm:py-14">
      <section className="mb-10 space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{copy.app.name}</h1>
        <p className="text-lg text-muted-foreground">{copy.app.tagline}</p>
        <p className="inline-flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground">
          <ShieldCheckIcon className="size-4 text-diff-equal-fg" />
          {copy.app.privacy}
        </p>
      </section>

      <h2 className="mb-4 text-sm font-medium text-muted-foreground">{copy.app.allTools}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <Link
            key={tool.id}
            to={`/${tool.path}`}
            className="group rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Card className="h-full gap-4 transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
              <CardHeader>
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <tool.icon className="size-5" />
                  </span>
                  {tool.status !== 'stable' && (
                    <Badge variant="secondary">{copy.toolStatus[tool.status]}</Badge>
                  )}
                </div>
                <CardTitle className="flex items-center gap-1.5">
                  {tool.name}
                  <ArrowRightIcon className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </CardTitle>
                <CardDescription className="leading-relaxed">{tool.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
