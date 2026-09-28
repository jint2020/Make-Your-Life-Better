import { expect, test } from '@playwright/test'

// pnpm e2e 跑的是纯静态 preview，没有 /api：这个工具依赖后端，两个入口都应该照常显示，只是标"暂不可用"

test('首页：文件转 Markdown 卡片标"暂不可用"，但仍然可以点进去', async ({ page }) => {
  await page.goto('/')
  const card = page.getByRole('main').getByRole('link', { name: /文件转 Markdown/ })
  await expect(card).toBeVisible()
  await expect(card.getByText('暂不可用')).toBeVisible()

  await card.click()
  await expect(page).toHaveURL(/\/file-to-markdown$/)
  await expect(page.getByRole('heading', { name: '文件转 Markdown' })).toBeVisible()
})

test('顶部导航：文件转 Markdown 入口也标"暂不可用"', async ({ page }) => {
  await page.goto('/excel-compare')
  const nav = page.getByRole('navigation').getByRole('link', { name: /文件转 Markdown/ })
  await expect(nav.getByText('暂不可用')).toBeVisible()
})

test('/file-to-markdown：说明后端不可用，不影响其他工具', async ({ page }) => {
  await page.goto('/file-to-markdown')
  await expect(page.getByTestId('backend-unavailable')).toContainText('服务器目前不可用')
  await expect(page.getByTestId('backend-unavailable')).toContainText('不影响其他工具')
  // 不应该出现登录引导或工具本体
  await expect(page.getByRole('link', { name: '登录后使用' })).toHaveCount(0)
  await expect(page.getByTestId('file-list')).toHaveCount(0)
})
