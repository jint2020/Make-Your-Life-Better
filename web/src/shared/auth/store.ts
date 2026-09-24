import { create } from 'zustand'

import { api, type Me } from '@/shared/api/client'

/**
 * 登录状态。账号只是附加能力：后端访问不到时是 'unavailable'，界面上隐藏账号和云端入口，工具照常可用。
 */
export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'unavailable'

interface AuthState {
  status: AuthStatus
  user: Me | null
  refresh(): Promise<void>
  setUser(user: Me): void
  logout(): Promise<void>
  /** 账号被删除等情况：本地直接回到未登录 */
  clear(): void
}

export const useAuth = create<AuthState>()((set) => ({
  status: 'loading',
  user: null,

  async refresh() {
    try {
      const { data, response } = await api.GET('/api/auth/me')
      if (data) set({ status: 'authenticated', user: data })
      else if (response.status === 401) set({ status: 'anonymous', user: null })
      else set({ status: 'unavailable', user: null })
    } catch {
      // 网络错误，或者没有后端（纯静态部署时 /api 返回的是 index.html，解析 JSON 会失败）
      set({ status: 'unavailable', user: null })
    }
  },

  setUser: (user) => set({ status: 'authenticated', user }),

  async logout() {
    try {
      await api.POST('/api/auth/logout')
    } finally {
      set({ status: 'anonymous', user: null })
    }
  },

  clear: () => set({ status: 'anonymous', user: null }),
}))
