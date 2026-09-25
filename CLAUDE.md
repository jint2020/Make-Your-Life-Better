# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser-based productivity toolkit ("Make Your Life Better"). The UI is Chinese-only, and so are the docs, comments and commit messages (`feat(excel-compare): …` style). Right now there is one tool: **Excel 数据对比** (`web/src/features/excel-compare`).

By default user data never leaves the machine: parsing and comparison always run in the browser. The backend (`docs/design.md` §三) only adds email accounts and opt-in "save to cloud" for tasks. The server stores data; it never parses or compares. Every tool must keep working when the user is logged out or the backend is down.

Layout:
- `web/` is the frontend, a standalone pnpm project. Its Dockerfile builds a Caddy image that serves `dist/` and proxies `/api/*` to `server:8000`.
- `server/` is the FastAPI backend, a uv project.
- The repo root holds the compose files, `.github/workflows/ci.yml` and the docs.

`docs/design.md` is the source of truth for product and design decisions, and it tracks implementation progress (已完成 / 待做). Update it **before** you change a design decision, and keep its progress section current.

## Commands

Frontend: pnpm, Node >= 22.22. Run everything from `web/`.

```bash
pnpm dev                  # Vite dev server
pnpm test                 # Vitest, all unit tests (src/**/*.test.ts, node environment)
pnpm vitest run src/features/excel-compare/engine/normalize.test.ts   # single file
pnpm vitest run -t "测试名"                                           # single test by name
pnpm e2e                  # Playwright smoke tests; builds, then serves preview on :4173
pnpm typecheck            # tsc -b
pnpm lint                 # oxlint (.oxlintrc.json)
pnpm build                # tsc -b && vite build
```

Backend: uv, Python 3.13. Run from `server/`, with dependencies up via `docker compose -f docker-compose.dev.yml up -d` (Postgres :5432, MinIO :9000 / console :9001, Mailpit :8025). Copy `.env.example` to `.env` first.

```bash
uv run fastapi dev app/main.py        # :8000; web's `pnpm dev` proxies /api here
uv run pytest                         # all tests; single: uv run pytest tests/test_health.py::test_health
uv run ruff check . && uv run ruff format --check .
uv run alembic upgrade head           # the container runs this on every start
uv run alembic revision --autogenerate -m "说明"
```

Full stack from production images (HTTP on :8080): `docker compose --env-file local-test.env -f docker-compose.yml -f docker-compose.local.yml up -d --build`.

- `compare.perf.test.ts` runs the engine on 3 × 100k rows × 20 cols. It is part of `pnpm test` and takes a few seconds.
- For E2E with an existing Chromium, set `PW_CHROMIUM_PATH=/path/to/chrome pnpm e2e`. In this cloud environment that is `/opt/pw-browsers/chromium`.
- E2E fixtures are uploaded as in-memory buffers rather than file paths, because Chromium cannot read Chinese filenames without a UTF-8 locale. Follow the same pattern in new tests. For the same reason, the Playwright configs launch Chromium with `LANG=C.UTF-8`; without it, Chinese download filenames become "download".
- `xlsx` is SheetJS 0.20.3 via the npm mirror `npm:@e965/xlsx@0.20.3`, the package the lockfile was generated with (`cdn.sheetjs.com` is not reachable everywhere). **Never** switch it to npm `xlsx` (0.18.5 has known vulnerabilities). To switch back to the official build: `pnpm add xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.

## Architecture

**Backend (`server/app/`).**
- All routes live under `/api`, including the docs at `/api/docs` and `/api/openapi.json`, because Caddy forwards the path unchanged.
- Config comes only from env vars (`config.py`, pydantic-settings).
- `db.py` provides the async SQLAlchemy engine and session; `models.py` has `Base`, which Alembic reads.
- `storage.py` talks to MinIO over S3 with boto3. boto3 is synchronous, so call it via `run_in_threadpool`.
- `/api/health` is liveness; `/api/health/ready` checks the DB and storage and returns 503 if either is down.
- Accounts (`routes/auth.py`, `auth.py`):
  - Email-code login auto-registers. Password login works only after the user sets a password while logged in; there is no separate reset flow.
  - A session is a random token in an httpOnly cookie on `path=/api`; the DB stores only its SHA-256.
  - Rate limits, lockout and quota numbers all come from `Settings`.
- Cloud tasks (`routes/cloud.py`): the task config (arbitrary JSON from the tool) goes in Postgres; the original files go in MinIO under `users/<uid>/tasks/<tid>/<fid>`. Downloads are streamed through the backend after an ownership check. The user row is locked while quota is checked.
- The mailer and object store are FastAPI dependencies (`get_mailer`, `get_object_store`); tests override them with `FakeMailer` and `InMemoryObjectStore`.
- Tests run against a real Postgres database `mylb_test`, created and truncated by `tests/conftest.py`. Without a DB they skip locally but fail in CI. They use httpx `ASGITransport`, so the app lifespan does not run.
- `Settings` has `env_ignore_empty=True`, because compose passes unset `${VAR:-}` values as empty strings.

**API contract.** `web/openapi.json` is exported from the server (`uv run python -m app.export_openapi > ../web/openapi.json`), and `pnpm gen:api` turns it into `web/src/shared/api/schema.d.ts`. Call the API through the typed `openapi-fetch` client in `web/src/shared/api/client.ts`. CI fails if either generated file is stale. Operation IDs are set explicitly on every route.

**CI.** On PRs, `ci.yml` only runs checks: web lint, typecheck, test and e2e; server ruff, pytest, `alembic upgrade head` + `alembic check` against Postgres, and the OpenAPI drift check. The full-stack E2E (`web/e2e-stack`, `pnpm e2e:stack`) is not in CI; run it locally against the compose stack, where it reads login codes from Mailpit's API. On pushes to main and `v*` tags, once the checks pass it also pushes `ghcr.io/jint2020/make-your-life-better-{web,server}`, tagged `latest` / `sha-xxxxxxx` / semver.

**Frontend.** All paths below are relative to `web/`.

**Tool registry → lazy routes.** `src/tools.registry.ts` is the single list of tools (`ToolMeta` with `load: () => import(...)`). The home page cards, the top navigation and the lazy routes in `src/app/router.tsx` are all generated from it. To add a tool:
1. Create `src/features/<id>/index.ts` and have it export `Component`.
2. Add a registry entry.

**Shared layer (`src/shared/`):**
- `worker/createWorkerClient.ts` is a Comlink wrapper. It creates the worker lazily and recreates it after a crash (for example OOM).
- `storage/` holds safe localStorage helpers and an IndexedDB task store (`idb`, tested with `fake-indexeddb`). The store is built, but the history UI is not wired up yet.
- `theme/` holds tweakcn CSS presets (`presets/<id>.css` plus an entry in `presets.ts`), light/dark mode, and `agGridTheme.ts`, which bridges the same CSS variables to AG Grid's Theming API. The semantic `--diff-*` colors follow only light/dark and are never overridden by presets.
- `auth/store.ts` holds the login state: `loading | anonymous | authenticated | unavailable`. `unavailable` covers no backend at all, for example `pnpm e2e` against a static preview. In that state, hide every account or cloud entry point and keep the tools working.
- `copy/zh.ts` holds global UI strings. Each feature also has its own `copy.ts`. Keep user-facing text in these files, not inline in components.

**Excel compare data flow.** Heavy data stays in the Web Worker:
- `worker/compare.worker.ts` holds workbooks, sheet grids and parsed tables in a `Map` keyed by `fileId`.
- The main thread only receives previews, header summaries (`TableSummary`, which includes a few sample values per column from `columnSamples`, shown in the field mapping) and the final `CompareResult`.
- Worker methods return `Result<T>` (`{ok, value} | {ok: false, error}`) and do not throw across the Comlink boundary. Errors are normalized with `parse/errors.ts`.

Pipeline:
- `parse/` reads files and builds tables:
  - `sheet.ts` reads xlsx with SheetJS and csv with PapaParse, and fills merged cells downward.
  - `headers.ts` detects the header row (skipping merged title rows), and renames blank and duplicate headers (`列C`, `姓名(2)`).
  - `encoding.ts` tries strict UTF-8 and falls back to GB18030.
  - `.xls` and encrypted files are rejected.
- `engine/` holds **pure functions**, unit tested:
  - `normalize.ts` handles value normalization: trimming, empty values treated as equal, numeric compare, dates to YYYY-MM-DD, and option toggles.
  - `compare.ts` handles composite-key matching and per-field comparison. Rows with duplicate or empty keys are set aside, not compared.
  - Tables are **columnar** (`ParsedTable`).
  - A row can carry several status tags at once. There is no single baseline file.
  - `diff[field][row]` is a per-file bitmask, not 0/1: bit f set means "highlight file f's value". With 3 files and a majority value, only the minority file is set (`diffMask`). Test "has a diff" with `!== 0`. `fieldFiles[field]` is the bitmask of files that map the field.
- `state/store.ts` is the zustand wizard store: 4 steps, upload → sheet/header row → fields → result.
  - `state/fields.ts` holds the field-mapping logic: auto-pairing same-name columns, bulk role set/undo, validation, and `toCompareConfig`.
  - Components read the store through `state/hooks.ts`.
- `grid/` is the read-only AG Grid Community result table. Modules are registered explicitly in `registerAgGrid.ts`; `ValidationModule` is registered only in dev. A grid API call whose module is not registered returns `undefined` in production builds instead of throwing, so register the module when you use a new API.
  - Columns are grouped by field first by default (`layout: 'field'`; each field's A / B / C side by side); users can switch to file-first, and the choice is saved in localStorage. Column ids are `v_<file>_<field>`.
  - In AG Grid 36, pinned and centre cells of a row live inside the same `.ag-row` element. E2E tests locate a row with `.ag-row` that has a `[col-id="key"]` child.
- `export/` builds the xlsx export inside the Worker. It does **not** use ExcelJS, which took 198 s and 3.6 GB for 100k rows. Instead:
  - `xlsxWriter.ts` is a minimal writer: shared strings, fflate streaming zip, fixed styles (`XLSX_STYLE`), merges, frozen panes, autofilter and column widths.
  - `buildExport.ts` maps a `CompareResult` to three sheets: the result, per-diff details, and the excluded rows. It follows the page's layout and highlight rules.
  - The worker keeps `lastResult` after `compare()`. The main thread sends only the displayed row indices in display order (`ResultGrid`'s `displayedRowsRef`, which needs `ClientSideRowModelApiModule`) and gets the file bytes back.
  - Both modules are dynamically imported on first export.
  - Unit tests read the output back with SheetJS; openpyxl was used as a stricter manual check.
- `cloud/cloud.ts` handles save, list, open and delete for cloud tasks.
  - Saving uploads the original `File`s. The store keeps them in a module-level `originals` map, outside zustand state; parsing still happens only in the Worker.
  - It also uploads `SavedCompareConfig` from `store.snapshot()`.
  - Opening downloads the files and calls `store.restore()`. That replays inspect → encoding/sheet/header row → `extractAll`, then reapplies the saved field rows only if the headers signature still matches, and finally runs the compare.
- `sample/makeSampleFiles.ts` generates deliberately messy sample files. The UI uses them, and so does `sample/pipeline.test.ts`.

Date handling: SheetJS dates come out as UTC. They are converted to the same wall-clock time in the local timezone. Numeric cells with zero-padded display formats are read as their displayed text.

**UI.** Tailwind v4 with shadcn/ui components in `src/components/ui/`. Add more with `pnpm dlx shadcn add <name>`. Components use the Radix primitives from the `radix-ui` package. The `@/` alias maps to `src/`. TypeScript is strict.

Rejected libraries: Handsontable (licensing) and Glide Data Grid (no stable React 19 support).
