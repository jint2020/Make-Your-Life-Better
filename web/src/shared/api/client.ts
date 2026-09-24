import createClient from 'openapi-fetch'

import type { components, paths } from './schema'

/**
 * 后端 API 客户端。类型由 server 的 OpenAPI 生成（pnpm gen:api），接口一改，这里的调用就会类型报错。
 * 前后端同源（生产由 Caddy 转发，开发由 Vite 代理），cookie 自动带上。
 */
export const api = createClient<paths>({ baseUrl: '/', credentials: 'same-origin' })

export type Me = components['schemas']['Me']
export type CloudTaskSummary = components['schemas']['CloudTaskSummary']
export type CloudTaskDetail = components['schemas']['CloudTaskDetail']
export type CloudUsage = components['schemas']['Usage']

/** 从错误响应里取出给用户看的文案（后端的 detail 已经是中文） */
export function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'detail' in error) {
    const detail = (error as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}
