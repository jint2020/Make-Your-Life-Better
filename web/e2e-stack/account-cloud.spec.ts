import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

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

async function chip(page: Page, label: string) {
  return page.getByRole('button', { name: new RegExp(`^${label} [\\d,]+$`) })
}

test('验证码注册 → 保存到云端 → 重新打开 → 设置密码 → 密码登录 → 删除账号', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`

  // 注册（验证码登录）
  await page.goto('/account')
  await page.getByLabel('邮箱').fill(email)
  await page.getByRole('button', { name: '发送验证码' }).click()
  await expect(page.getByText(`验证码已发送到 ${email}`)).toBeVisible()
  await page.getByLabel('验证码').fill(await latestCode(email))
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByTestId('account-email')).toHaveText(email)
  await expect(page.getByTestId('account-button')).toContainText(email)

  // 跑一次对比并保存到云端
  await page.goto('/excel-compare')
  await expect(page.getByTestId('cloud-tasks')).toContainText('还没有保存过任务')
  await page.getByTestId('file-input').setInputFiles([fixture('名单-GBK.csv'), fixture('名单-UTF8.csv')])
  await expect(page.getByTestId('file-row').nth(1)).toContainText('CSV')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '开始对比' }).click()
  await expect(await chip(page, '有差异')).toContainText('2')
  await page.getByRole('button', { name: '保存到云端' }).click()
  await expect(page.getByRole('button', { name: '已保存到云端' })).toBeVisible()

  // 重新开始，从云端打开，直接得到同样的结果
  await page.getByRole('button', { name: '重新开始' }).click()
  const list = page.getByTestId('cloud-tasks')
  await expect(list).toContainText('名单-GBK.csv · 名单-UTF8.csv')
  await expect(list).toContainText('2 个文件')
  await list.getByRole('button', { name: '打开' }).click()
  await expect(await chip(page, '全部')).toContainText('5')
  await expect(await chip(page, '有差异')).toContainText('2')
  await expect(await chip(page, '有缺失')).toContainText('2')

  // 账号页显示已用空间
  await page.goto('/account')
  await expect(page.getByText('1 / 50 个任务')).toBeVisible()

  // 设置密码，退出，再用密码登录
  await page.getByLabel('新密码（至少 8 位）').fill('e2e password 123')
  await page.getByRole('button', { name: '保存密码' }).click()
  await expect(page.getByText('密码已保存')).toBeVisible()
  await page.getByRole('button', { name: '退出登录' }).click()
  await page.getByRole('tab', { name: '密码登录' }).click()
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码', { exact: true }).fill('wrong password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('邮箱或密码不正确')).toBeVisible()
  await page.getByLabel('密码', { exact: true }).fill('e2e password 123')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByTestId('account-email')).toHaveText(email)

  // 删除云端任务
  await page.goto('/excel-compare')
  const again = page.getByTestId('cloud-tasks')
  await again.getByRole('button', { name: /^删除/ }).click()
  await again.getByRole('button', { name: '确认删除' }).click()
  await expect(again).toContainText('还没有保存过任务')

  // 删除账号
  await page.goto('/account')
  await page.getByRole('button', { name: '删除账号' }).click()
  await page.getByRole('button', { name: '确认删除（不能恢复）' }).click()
  await expect(page.getByRole('heading', { name: '登录 / 注册' })).toBeVisible()
})

test('未登录：结果页引导登录，工具照常可用', async ({ page }) => {
  await page.goto('/excel-compare')
  await expect(page.getByTestId('account-button')).toContainText('登录')
  await expect(page.getByTestId('cloud-tasks')).toHaveCount(0)
  await page.getByTestId('file-input').setInputFiles([fixture('名单-GBK.csv'), fixture('名单-UTF8.csv')])
  await expect(page.getByTestId('file-row').nth(1)).toContainText('CSV')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '开始对比' }).click()
  await expect(page.getByRole('link', { name: '登录后可以保存到云端' })).toBeVisible()
})
