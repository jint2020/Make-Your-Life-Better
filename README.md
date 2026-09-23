# Make Your Life Better

浏览器里的提效工具集。纯前端，数据只在本机处理。

设计决策见 [docs/design.md](docs/design.md)。

## 技术栈

Vite 8 · React 19 · TypeScript（strict）· Tailwind v4 · shadcn/ui（Radix）· tweakcn 主题 · React Router 8 · AG Grid Community 36 · Comlink（Worker）· idb（IndexedDB）· Vitest · Playwright

## 开发

```bash
pnpm install
pnpm dev          # 本地开发
pnpm test         # 单元测试（Vitest）
pnpm e2e          # 冒烟测试（Playwright，会先 build）
pnpm typecheck
pnpm lint         # oxlint
pnpm build
```

### 下一步需要安装 SheetJS

解析 xlsx 用 SheetJS 0.20.3。它只在官方 CDN 发布，npm 上的 `xlsx` 还停在 0.18.5，而且有已知漏洞，不要用那个版本：

```bash
pnpm add https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

## 目录结构

```
src/
  app/                  应用外壳：路由、布局、首页、404
  components/ui/        shadcn 组件（可以用 `pnpm dlx shadcn add xxx` 继续添加）
  shared/
    copy/zh.ts          全局文案
    theme/              主题：预设（tweakcn CSS）、深浅色、AG Grid 主题桥
    storage/            localStorage 安全封装、IndexedDB 任务存储
    worker/             Worker 客户端（Comlink）
  features/
    excel-compare/      工具一：Excel 数据对比
      engine/           对比引擎（纯函数，含单测）
      parse/            表头清洗、CSV 编码检测（含单测）
      worker/           对比 Worker
      grid/             AG Grid 结果表
      components/       步骤条、汇总条、结果视图
      demo/             示例数据生成
  tools.registry.ts     工具注册表
```

## 新增一个工具

1. 新建 `src/features/<tool-id>/index.ts`，导出 `Component`
2. 在 `src/tools.registry.ts` 里加一条记录

首页卡片、顶部导航和懒加载路由会自动生成。

## 新增一套主题

1. 在 [tweakcn.com](https://tweakcn.com) 调好主题，复制 Code 面板里的 CSS（`:root` 和 `.dark` 两块）
2. 保存为 `src/shared/theme/presets/<id>.css`
3. 在 `src/shared/theme/presets.ts` 里登记一行

差异高亮用的语义色（`--diff-*`）不会被主题覆盖。
