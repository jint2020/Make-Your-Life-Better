import { createBrowserRouter } from 'react-router'

import { TOOLS } from '@/tools.registry'
import { AppShell } from './layout/AppShell'
import { RouteError } from './pages/RouteError'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PageLoading } from './layout/PageLoading'

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppShell,
    ErrorBoundary: RouteError,
    HydrateFallback: PageLoading,
    children: [
      { index: true, Component: HomePage },
      ...TOOLS.map((tool) => ({
        path: tool.path,
        handle: { toolId: tool.id },
        lazy: async () => {
          const mod = await tool.load()
          return { Component: mod.Component }
        },
      })),
      { path: '*', Component: NotFoundPage },
    ],
  },
])
