import { expect, test } from '@playwright/test'

test('首页列出工具，点击进入 Excel 对比', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Make Your Life Better' })).toBeVisible()
  await page.getByRole('main').getByRole('link', { name: /Excel 数据对比/ }).click()
  await expect(page).toHaveURL(/\/excel-compare$/)
  await expect(page.getByRole('heading', { name: 'Excel 数据对比' })).toBeVisible()
})

test('直接打开工具路由（懒加载）也能渲染', async ({ page }) => {
  await page.goto('/excel-compare')
  await expect(page.getByRole('heading', { name: 'Excel 数据对比' })).toBeVisible()
})

test('10 万行示例数据：Worker 生成 + 表格渲染', async ({ page }) => {
  await page.goto('/excel-compare')
  const started = Date.now()
  await page.getByRole('button', { name: /10万 行 × 3 个文件/ }).click()
  const grid = page.getByTestId('result-grid')
  await expect(grid.locator('.ag-row').first()).toBeVisible({ timeout: 15_000 })
  const elapsed = Date.now() - started
  console.log(`10万行：点击到首行可见 ${elapsed} ms`)
  expect(elapsed).toBeLessThan(5_000)

  // 默认只显示有差异的行，差异单元格有高亮
  await expect(grid.locator('.mylb-cell-diff').first()).toBeVisible()

  // 切到"全部"后按主键搜索，只剩一行
  await page.getByRole('button', { name: /^全部 [\d,]+$/ }).click()
  await page.getByLabel('搜索主键…').fill('FS100000')
  await expect(grid.locator('.ag-row')).toHaveCount(1)
})

test('未知路由显示 404', async ({ page }) => {
  await page.goto('/no-such-tool')
  await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible()
})
