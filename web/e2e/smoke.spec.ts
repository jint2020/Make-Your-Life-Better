import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

/**
 * 以内存 buffer 的方式上传，而不是传文件路径：
 * 系统没有设置 UTF-8 locale 时，Chromium 读不了中文路径的文件。
 */
const fixture = (name: string) => ({
  name,
  mimeType: name.endsWith('.csv') ? 'text/csv' : 'application/octet-stream',
  buffer: fs.readFileSync(path.join(import.meta.dirname, 'fixtures', name)),
})

async function chip(page: Page, label: string) {
  return page.getByRole('button', { name: new RegExp(`^${label} [\\d,]+$`) })
}

test('首页列出工具，点击进入 Excel 对比', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Make Your Life Better' })).toBeVisible()
  await page.getByRole('main').getByRole('link', { name: /Excel 数据对比/ }).click()
  await expect(page).toHaveURL(/\/excel-compare$/)
  await expect(page.getByRole('heading', { name: 'Excel 数据对比' })).toBeVisible()
})

test('未知路由显示 404', async ({ page }) => {
  await page.goto('/no-such-tool')
  await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible()
})

test('上传：GBK 编码自动识别，拒绝 .xls', async ({ page }) => {
  await page.goto('/excel-compare')
  await page.getByTestId('file-input').setInputFiles([
    fixture('名单-GBK.csv'),
    fixture('名单-UTF8.csv'),
    fixture('旧格式.xls'),
  ])
  const rows = page.getByTestId('file-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('CSV · GBK')
  await expect(rows.nth(1)).toContainText('CSV · UTF-8')
  await expect(rows.nth(2)).toContainText('不支持旧版 .xls')
  await expect(page.getByRole('button', { name: '下一步' })).toBeDisabled()

  await rows.nth(2).getByRole('button', { name: /移除/ }).click()
  await expect(page.getByRole('button', { name: '下一步' })).toBeEnabled()
})

test('完整流程：两个 CSV → 自动配对 → 对比结果', async ({ page }) => {
  await page.goto('/excel-compare')
  await page.getByTestId('file-input').setInputFiles([fixture('名单-GBK.csv'), fixture('名单-UTF8.csv')])
  await expect(page.getByTestId('file-row').nth(1)).toContainText('CSV')
  await page.getByRole('button', { name: '下一步' }).click()

  // 第 2 步：预览里能看到 GBK 解码后的中文
  await expect(page.getByTestId('sheet-card').first()).toContainText('培训中心')
  await page.getByRole('button', { name: '下一步' }).click()

  // 第 3 步：同名列自动配对，工号自动识别为主键
  await expect(page.getByLabel('工号 的用途')).toHaveValue('key')
  await page.getByRole('button', { name: '开始对比' }).click()

  // 结果
  await expect(await chip(page, '全部')).toContainText('5')
  await expect(await chip(page, '有差异')).toContainText('2')
  await expect(await chip(page, '有缺失')).toContainText('2')
  await expect(await chip(page, '全部一致')).toContainText('1')
  const grid = page.getByTestId('result-grid')
  await expect(grid.locator('.ag-row')).toHaveCount(2) // 默认只看有差异
  await expect(grid.locator('.mylb-cell-diff').first()).toBeVisible()

  // 行详情
  await grid.locator('.ag-row').first().click()
  const detail = page.getByRole('dialog')
  await expect(detail).toContainText('记录详情')
  await expect(detail).toContainText('政企客户部')
})

test('示例文件：大标题、列名不一致、主键重复/为空', async ({ page }) => {
  await page.goto('/excel-compare')
  await page.getByRole('button', { name: /示例：3 个文件/ }).click()
  await expect(page.getByTestId('file-row')).toHaveCount(3)
  await expect(page.getByRole('button', { name: '下一步' })).toBeEnabled({ timeout: 15_000 })
  await page.getByRole('button', { name: '下一步' }).click()

  // A 文件第 1 行是合并的大标题，表头自动识别为第 2 行
  await expect(page.getByLabel('表头在第几行').first()).toHaveValue('2')
  await page.getByRole('button', { name: '下一步' }).click()

  // "员工编号"和"工号"名字不同，但都像主键，自动配上
  await expect(page.getByLabel('工号 在文件 2 中对应的列')).toHaveValue('员工编号')
  await expect(page.getByLabel('工号 的用途')).toHaveValue('key')

  // 批量设置：全部忽略（主键不动）→ 撤销 → 恢复原样
  const roleOf = (label: string) => page.getByLabel(`${label} 的用途`)
  const bulk = page.getByLabel('批量设置所有非主键字段的用途')
  await bulk.selectOption('ignore')
  await expect(page.getByTestId('bulk-notice')).toContainText('已将 5 个字段设为忽略（主键未改动）')
  await expect(roleOf('工号')).toHaveValue('key')
  for (const f of ['姓名', '部门', '岗位', '入职日期', '学分']) await expect(roleOf(f)).toHaveValue('ignore')
  await expect(bulk).toHaveValue('')
  await page.getByRole('button', { name: '撤销' }).click()
  await expect(page.getByTestId('bulk-notice')).toBeHidden()
  await expect(roleOf('姓名')).toHaveValue('compare')

  // 再批量忽略，然后逐行挑要比的字段；手动修改后提示消失
  await bulk.selectOption('ignore')
  await roleOf('部门').selectOption('compare')
  await roleOf('学分').selectOption('compare')
  await expect(page.getByTestId('bulk-notice')).toBeHidden()
  await roleOf('岗位').selectOption('display')
  await page.getByRole('button', { name: '开始对比' }).click()
  await expect(page.getByTestId('result-grid').locator('.ag-header-cell-text', { hasText: '姓名' })).toHaveCount(0)

  await expect(await chip(page, '主键重复')).toContainText('4')
  await expect(await chip(page, '主键为空')).toContainText('1')
  await (await chip(page, '主键重复')).click()
  await expect(page.getByRole('dialog')).toContainText('未参与对比的行')
  await page.keyboard.press('Escape')

  // 调整配置抽屉：打开"忽略大小写"后重新对比
  await page.getByRole('button', { name: '调整配置' }).click()
  await page.getByRole('dialog').getByRole('switch', { name: /忽略大小写/ }).click()
  await page.getByRole('button', { name: '重新对比' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('性能：3 个文件 × 10 万行', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/excel-compare')
  await page.getByRole('button', { name: /性能测试/ }).click()
  await expect(page.getByRole('button', { name: '下一步' })).toBeEnabled({ timeout: 60_000 })
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await expect(page.getByLabel('工号 的用途')).toHaveValue('key')

  const started = Date.now()
  await page.getByRole('button', { name: '开始对比' }).click()
  await expect(page.getByTestId('result-grid').locator('.ag-row').first()).toBeVisible({ timeout: 30_000 })
  const elapsed = Date.now() - started
  console.log(`10 万行 × 3：点"开始对比"到出结果 ${elapsed} ms`)
  expect(elapsed).toBeLessThan(5_000)
})
