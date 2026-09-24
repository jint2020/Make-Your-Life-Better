# Make Your Life Better

浏览器里的提效工具集。默认数据只在本机处理：解析和对比都在浏览器里完成。

设计决策见 [docs/design.md](docs/design.md)。

## 技术栈

Vite 8 · React 19 · TypeScript（strict）· zustand · SheetJS 0.20 · PapaParse · Tailwind v4 · shadcn/ui（Radix）· tweakcn 主题 · React Router 8 · AG Grid Community 36 · Comlink（Worker）· idb（IndexedDB）· Vitest · Playwright

## 开发

仓库分成 `web/`（前端，Vite）和 `server/`（后端，FastAPI）。架构见设计文档第三节。

### 前端

在 `web/` 目录下执行：

```bash
cd web
pnpm install
pnpm dev          # 本地开发
pnpm test         # 单元测试（Vitest）
pnpm e2e          # 冒烟测试（Playwright，会先 build）
pnpm typecheck
pnpm lint         # oxlint
pnpm build
```

### 后端

需要 [uv](https://docs.astral.sh/uv/) 和 Docker。依赖服务（PostgreSQL、MinIO、Mailpit）用 Docker 起，后端在本机跑：

```bash
docker compose -f docker-compose.dev.yml up -d   # 依赖服务
cd server
cp .env.example .env
uv sync
uv run alembic upgrade head                      # 数据库迁移
uv run fastapi dev app/main.py                   # http://localhost:8000/api/docs
uv run pytest                                    # 测试
uv run ruff check . && uv run ruff format .      # 检查、格式化
```

前端 `pnpm dev` 会把 `/api` 转发到 `localhost:8000`，和生产一样同源。

- MinIO 控制台：http://localhost:9001（mylb / mylb-dev-secret）
- Mailpit 收件箱：http://localhost:8025

新增数据库迁移：`uv run alembic revision --autogenerate -m "说明"`，生成后检查一遍再提交（CI 会跑 `alembic check`，改了模型没生成迁移会失败）。

改了接口之后，重新生成前端的 API 类型（CI 会检查两者一致）：

```bash
cd server && uv run python -m app.export_openapi > ../web/openapi.json
cd ../web && pnpm gen:api     # 生成 src/shared/api/schema.d.ts
```

### 上线前自测

用本机构建的生产镜像起全套服务（Caddy + server + postgres + minio + mailpit），只走 HTTP：

```bash
docker compose --env-file local-test.env -f docker-compose.yml -f docker-compose.local.yml up -d --build
# 打开 http://localhost:8080，验证码邮件在 http://localhost:8025
cd web && pnpm e2e:stack      # 全栈 E2E：注册、保存到云端、重新打开、密码登录、删除账号
docker compose --env-file local-test.env -f docker-compose.yml -f docker-compose.local.yml down
```

### 关于 SheetJS（xlsx 解析）

npm 上的 `xlsx` 还停在 0.18.5，有已知漏洞，不要用那个版本。

`web/package.json` 目前用的是 npm 上的社区镜像包 `@e965/xlsx@0.20.3`（内容和官方 0.20.3 相同，但不是官方发布），因为 lockfile 就是按它生成的，CI 和 Docker 构建也不用访问 `cdn.sheetjs.com`。

能访问官方 CDN 时，可以切回官方包（会同时更新 lockfile）：

```bash
pnpm add xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

## 部署

服务器上只需要 Docker（带 compose 插件）。推送到 main 或者打 `v*` tag 后，GitHub Actions 会先跑完全部检查，再把 `web`、`server` 两个镜像推送到 GHCR：

- `ghcr.io/jint2020/make-your-life-better-web`
- `ghcr.io/jint2020/make-your-life-better-server`

GHCR 上的包默认是私有的。要么在包设置里改成公开，要么先在服务器上用有 `read:packages` 权限的 token 执行 `docker login ghcr.io`。

第一次部署：

```bash
# 服务器上，只需要 docker-compose.yml 和 .env 两个文件
cp .env.example .env    # 填 SITE_ADDRESS（域名）、SMTP 发信配置和两个密码
docker compose pull
docker compose up -d
```

- 域名要先解析到服务器，80/443 端口要放开，Caddy 会自动申请 HTTPS 证书
- 只有 Caddy 对外；数据库和 MinIO 只在内部网络
- 后端启动时会自动执行数据库迁移

更新和回滚：改 `.env` 里的 `APP_VERSION`（`latest`、`sha-xxxxxxx` 或 `1.2.3`），然后 `docker compose pull && docker compose up -d`。

没有镜像仓库时也可以在服务器上现场构建：把整个仓库拉到服务器上，执行 `docker compose up -d --build`。

MinIO 用的是社区维护的分支 `pgsty/minio`（官方已经不再往 Docker Hub 发布镜像）。想换镜像时在 `.env` 里设置 `MINIO_IMAGE`。

**目前没有备份**（设计文档里记为已知风险）：服务器磁盘损坏或服务器被删，账号和云端文件都会丢失。

## 目录结构

```
docs/design.md          设计决策
docker-compose.yml      生产部署（Caddy + server + postgres + minio）
docker-compose.dev.yml  本机开发的依赖服务
docker-compose.local.yml  上线前自测（叠加在生产配置上）
.github/workflows/      CI：检查 + 构建推送镜像
server/                 后端（FastAPI）
  app/                  应用代码：配置、数据表、会话、发信、对象存储
    routes/             接口：health、auth（账号）、cloud（云端任务）
  migrations/           Alembic 数据库迁移
web/                    前端（Vite 项目；Dockerfile + Caddyfile 打成 Caddy 镜像）
web/src/
  app/                  应用外壳：路由、布局、首页、404
  components/ui/        shadcn 组件（可以用 `pnpm dlx shadcn add xxx` 继续添加）
  shared/
    copy/zh.ts          全局文案
    theme/              主题：预设（tweakcn CSS）、深浅色、AG Grid 主题桥
    storage/            localStorage 安全封装、IndexedDB 任务存储
    worker/             Worker 客户端（Comlink）
  features/
    excel-compare/      工具一：Excel 数据对比
      engine/           对比引擎：归一化、主键匹配、逐字段比较（纯函数，含单测和性能测试）
      parse/            xlsx / csv 解析、合并单元格、表头清洗、编码检测（含单测）
      state/            向导状态（zustand）和字段映射逻辑
      worker/           Worker：文件、网格、表格都留在 Worker 里，主线程只拿预览和结果
      grid/             AG Grid 结果表
      components/       向导各步骤、配置抽屉、行详情、未参与对比的行
      sample/           示例文件生成（也用于 E2E 测试）
  tools.registry.ts     工具注册表
```

## 新增一个工具

1. 新建 `web/src/features/<tool-id>/index.ts`，导出 `Component`
2. 在 `web/src/tools.registry.ts` 里加一条记录

首页卡片、顶部导航和懒加载路由会自动生成。

## 新增一套主题

1. 在 [tweakcn.com](https://tweakcn.com) 调好主题，复制 Code 面板里的 CSS（`:root` 和 `.dark` 两块）
2. 保存为 `web/src/shared/theme/presets/<id>.css`
3. 在 `web/src/shared/theme/presets.ts` 里登记一行

差异高亮用的语义色（`--diff-*`）不会被主题覆盖。
