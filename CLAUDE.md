# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser-only productivity toolkit ("Make Your Life Better"). Pure frontend: user data never leaves the machine, so there is no backend. The UI is Chinese-only, and so are the docs, comments and commit messages (`feat(excel-compare): …` style). Right now there is one tool: **Excel 数据对比** (`src/features/excel-compare`).

`docs/design.md` is the source of truth for product and design decisions, and it tracks implementation progress (已完成 / 待做). Update it **before** you change a design decision, and keep its progress section current.

## Commands

pnpm, Node >= 22.22.

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

- `compare.perf.test.ts` runs the engine on 3 × 100k rows × 20 cols. It is part of `pnpm test` and takes a few seconds.
- For E2E with an existing Chromium, set `PW_CHROMIUM_PATH=/path/to/chrome pnpm e2e`. In this cloud environment that is `/opt/pw-browsers/chromium`.
- E2E fixtures are uploaded as in-memory buffers rather than file paths, because Chromium cannot read Chinese filenames without a UTF-8 locale. Follow the same pattern in new tests.
- `xlsx` is SheetJS 0.20.3 installed from the official CDN tarball. **Never** switch it to npm `xlsx` (0.18.5 has known vulnerabilities). If the CDN is unreachable, the fallback is `pnpm add xlsx@npm:@e965/xlsx@0.20.3`.

## Architecture

**Tool registry → lazy routes.** `src/tools.registry.ts` is the single list of tools (`ToolMeta` with `load: () => import(...)`). The home page cards, the top navigation and the lazy routes in `src/app/router.tsx` are all generated from it. To add a tool:
1. Create `src/features/<id>/index.ts` and have it export `Component`.
2. Add a registry entry.

**Shared layer (`src/shared/`):**
- `worker/createWorkerClient.ts` is a Comlink wrapper. It creates the worker lazily and recreates it after a crash (for example OOM).
- `storage/` holds safe localStorage helpers and an IndexedDB task store (`idb`, tested with `fake-indexeddb`). The store is built, but the history UI is not wired up yet.
- `theme/` holds tweakcn CSS presets (`presets/<id>.css` plus an entry in `presets.ts`), light/dark mode, and `agGridTheme.ts`, which bridges the same CSS variables to AG Grid's Theming API. The semantic `--diff-*` colors follow only light/dark and are never overridden by presets.
- `copy/zh.ts` holds global UI strings. Each feature also has its own `copy.ts`. Keep user-facing text in these files, not inline in components.

**Excel compare data flow.** Heavy data stays in the Web Worker:
- `worker/compare.worker.ts` holds workbooks, sheet grids and parsed tables in a `Map` keyed by `fileId`.
- The main thread only receives previews, header summaries (`TableSummary`) and the final `CompareResult`.
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
- `state/store.ts` is the zustand wizard store: 4 steps, upload → sheet/header row → fields → result.
  - `state/fields.ts` holds the field-mapping logic: auto-pairing same-name columns, bulk role set/undo, validation, and `toCompareConfig`.
  - Components read the store through `state/hooks.ts`.
- `grid/` is the read-only AG Grid Community result table. Modules are registered explicitly in `registerAgGrid.ts`; `ValidationModule` is registered only in dev. Columns are grouped by file first, then by field.
- `sample/makeSampleFiles.ts` generates deliberately messy sample files. The UI uses them, and so does `sample/pipeline.test.ts`.

Date handling: SheetJS dates come out as UTC. They are converted to the same wall-clock time in the local timezone. Numeric cells with zero-padded display formats are read as their displayed text.

**UI.** Tailwind v4 with shadcn/ui components in `src/components/ui/`. Add more with `pnpm dlx shadcn add <name>`. Components use the Radix primitives from the `radix-ui` package. The `@/` alias maps to `src/`. TypeScript is strict.

Rejected libraries: Handsontable (licensing) and Glide Data Grid (no stable React 19 support).
