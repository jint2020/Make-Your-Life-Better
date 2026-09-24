import { defineConfig, devices } from '@playwright/test'

/**
 * 全套服务的 E2E（登录、云端保存）。先用生产镜像起全套服务：
 *   docker compose --env-file local-test.env -f docker-compose.yml -f docker-compose.local.yml up -d --build
 * 再执行 pnpm e2e:stack。验证码从 Mailpit 的 API 读取。
 */
export default defineConfig({
  testDir: './e2e-stack',
  timeout: 60_000,
  use: {
    baseURL: process.env.STACK_URL ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
})
