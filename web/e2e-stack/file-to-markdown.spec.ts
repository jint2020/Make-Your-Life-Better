import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025'

const fixture = (name: string) => ({
  name,
  mimeType: 'text/csv',
  buffer: fs.readFileSync(path.join(import.meta.dirname, '..', 'e2e', 'fixtures', name)),
})

/** 从 Mailpit 取发给某个邮箱的最新验证码 */
async function latestCode(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    const body = (await res.json()) as { messages: { Subject: string }[] }
    const match = body.messages[0]?.Subject.match(/\d{6}/)
    if (match) return match[0]
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`没有收到发给 ${email} 的验证码`)
}

test('登录 → 上传 CSV → 确认弹窗 → 转换出 Markdown 表格', async ({ page }) => {
  const email = `e2e-f2md-${Date.now()}@example.com`

  // 注册（验证码登录），复用账号页现有的流程
  await page.goto('/account')
  await page.getByLabel('邮箱').fill(email)
  await page.getByRole('button', { name: '发送验证码' }).click()
  await expect(page.getByText(`验证码已发送到 ${email}`)).toBeVisible()
  await page.getByLabel('验证码').fill(await latestCode(email))
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByTestId('account-email')).toHaveText(email)

  // 打开工具：已登录、后端可用，应该直接看到工具本体
  await page.goto('/file-to-markdown')
  await expect(page.getByTestId('file-list')).toBeVisible()

  // 第一次添加文件：先弹出确认对话框
  await page.getByTestId('file-input').setInputFiles([fixture('名单-UTF8.csv')])
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('转换完成后立即删除')
  await expect(page.getByTestId('file-item')).toHaveCount(0) // 确认前还没真正加入队列

  await dialog.getByRole('button', { name: '继续' }).click()
  await expect(dialog).toBeHidden()

  const item = page.getByTestId('file-item').first()
  await expect(item).toContainText('名单-UTF8.csv')
  // 完成态没有"完成"字样，而是对勾 + 字符 / Token 统计，所以用 data-status 断言
  await expect(item).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
  await expect(item).toContainText('字符')
  await expect(item).toContainText('Token')

  // 右侧显示 Markdown 表格，包含 CSV 里的中文表头和内容
  const pane = page.getByTestId('markdown-content')
  await expect(pane).toContainText('工号')
  await expect(pane).toContainText('张三')
  await expect(pane).toContainText('政企客户部')
  await expect(pane).toContainText('|') // 是个 Markdown 表格

  // 再加一个文件：这次不用再确认
  await page.getByTestId('file-input').setInputFiles([fixture('名单-GBK.csv')])
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('file-item')).toHaveCount(2)
})
