# PostDeck Phase 2 — Dashboard (L1) + CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only L1 dashboard that shows every managed blog's publish/scheduled/draft status on one screen, plus an `npx postdeck` CLI that boots it locally against the user's `blogs.config.ts`.

**Architecture:** Additive engine function `loadProjects` returns per-project views (posts + counts + source capabilities + isolated error) on top of the existing `loadPosts`. A Next.js App Router server component calls it (fs/git/Notion stay server-side) and renders three views: project cards, a merged calendar, and per-project post lists with i18n variant badges. A tiny CLI loads and validates `blogs.config.ts` with jiti, then spawns `next dev`. The tool repo carries zero real data — the real config and `.env` are gitignored; only `*.example` files are committed.

**Tech Stack:** TypeScript (NodeNext, strict, `verbatimModuleSyntax`), pnpm workspace, Vitest, Zod, Next.js 15 (App Router) + React 19, jiti 2, dotenv, yaml.

## Global Constraints

- **Runtime floor:** `engines.node >= 20` on root + every package.json (copy exactly: `"engines": { "node": ">=20" }`).
- **Additive only:** do NOT change `loadPosts`'s signature or behavior; all 28 existing tests must stay green.
- **L1 is metadata-only:** do NOT implement any adapter `read()`; the dashboard uses `list()` only.
- **Serializable config:** `blogs.config.ts` stays plain data (no closures) via `defineBlogs`/`*Source` helpers.
- **No real data in git:** real `blogs.config.ts` and `.env` are gitignored; only `blogs.config.example.ts` and `.env.example` are committed. Committed docs/plans use placeholder absolute paths (`<PROD_LINE>`), never real machine paths.
- **Import extensions:** all intra-package imports use `.js` extensions (NodeNext), even from `.ts` sources.
- **Test colocation:** unit tests live next to source as `*.test.ts` and run under Vitest.
- **Dependency hygiene:** `@postdeck/core` stays pure (zod only). Node/impure glue (fs, git, jiti) lives in `@postdeck/adapters`. Next/React live only in `apps/dashboard`.

---

## File Structure

**Modified:**
- `packages/adapters/src/engine.ts` — add `ProjectView`, `loadProjects`; extract shared `normalizeRaws`/`countByStatus`; keep `loadPosts` behavior identical.
- `packages/adapters/src/index.ts` — export `loadProjects`, `ProjectView`, `loadBlogsConfig`, `resolveConfigPath`.
- `packages/adapters/src/localfs.ts` — clamp allows a filesystem-root store; `list()` swallows only ENOENT.
- `packages/adapters/package.json` — add `jiti`; add `engines`.
- `packages/core/package.json`, root `package.json` — add `engines`; extend `typecheck`.
- `vitest.config.ts` — include `apps/**/*.test.ts`.
- `.gitignore` — ignore real config, `.env`, Next/build artifacts.

**Created (packages):**
- `packages/adapters/src/config-loader.ts` (+ `.test.ts`) — `resolveConfigPath`, `loadBlogsConfig`.
- `packages/adapters/src/engine.test.ts` additions — `loadProjects` tests (same file as existing).
- `packages/core/src/status.test.ts` / `translations.test.ts` additions — carried-over hardening.

**Created (repo root):**
- `blogs.config.example.ts` — placeholder 3-source example (committed).
- `.env.example` — `NOTION_TOKEN` / `NOTION_DB` names (committed).
- `blogs.config.ts` — real 3 blogs (gitignored, created at execution time from values NOT in this plan).
- `.env` — real Notion creds (gitignored, user-supplied).

**Created (`apps/dashboard`):**
- `package.json`, `next.config.mjs`, `tsconfig.json`, `next-env.d.ts` (generated).
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`.
- `lib/data.ts` — `getProjects()` (server-side load).
- `lib/badges.ts` (+ `.test.ts`) — pure badge helpers.
- `lib/calendar.ts` (+ `.test.ts`) — pure calendar bucketing.
- `components/ProjectCard.tsx`, `components/PostList.tsx`, `components/VariantBadges.tsx`, `components/Calendar.tsx`.

**Created (`apps/cli`):**
- `package.json`, `bin/postdeck.mjs`, `src/main.ts`, `src/args.ts` (+ `args.test.ts`).

---

## Task 1: Engine — `loadProjects` + `ProjectView`

**Files:**
- Modify: `packages/adapters/src/engine.ts` (full rewrite below)
- Modify: `packages/adapters/src/index.ts`
- Test: `packages/adapters/src/engine.test.ts` (append)

**Interfaces:**
- Consumes: `resolveSource`, `toPost`, `groupTranslations`, `BlogsConfig`, `SourceDeps`, `Post`, `SourceCapabilities`, `BlogConfig`, `RawPost` from `@postdeck/core`.
- Produces:
  - `interface ProjectView { id: string; name: string; liveUrl?: string; sourceType: 'notion'|'markdown'|'astro-collection'; capabilities: SourceCapabilities; posts: Post[]; counts: { draft: number; scheduled: number; published: number }; error?: string }`
  - `loadProjects(config: BlogsConfig, deps: SourceDeps, now?: Date): Promise<ProjectView[]>`
  - `loadPosts` unchanged: `(config: BlogsConfig, deps: SourceDeps, now?: Date) => Promise<Record<string, Post[]>>`

- [ ] **Step 1: Write the failing tests** (append to `packages/adapters/src/engine.test.ts`)

```ts
import { loadProjects } from './index.js'

test('loadProjects returns per-project counts and capabilities', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-proj-'))
  mkdirSync(join(root, 'guides'), { recursive: true })
  writeFileSync(join(root, 'guides/a.md'), '---\ntitle: A\ndatePublished: "2026-01-01"\ndescription: d\n---\nx', 'utf8')
  writeFileSync(join(root, 'guides/b.md'), '---\ntitle: B\ndatePublished: "2026-12-01"\ndescription: d\n---\nx', 'utf8')
  const config = defineBlogs([{
    id: 'freelance', name: 'Freelance', liveUrl: 'https://x.com/blog',
    source: markdownSource({ dir: join(root, 'guides') }),
    fieldMap: { title: 'title', date: 'datePublished', excerpt: 'description' },
    statusRule: { allPublished: true },
  }])
  const views = await loadProjects(config, { env: () => undefined, fileStore: createLocalFs('/') }, new Date('2026-08-16'))
  expect(views).toHaveLength(1)
  expect(views[0].id).toBe('freelance')
  expect(views[0].name).toBe('Freelance')
  expect(views[0].sourceType).toBe('markdown')
  expect(views[0].capabilities.enforcesFutureDates).toBe(false)
  // allPublished forces both to published regardless of the future date
  expect(views[0].counts).toEqual({ draft: 0, scheduled: 0, published: 2 })
  expect(views[0].error).toBeUndefined()
})

test('loadProjects isolates a failing project instead of throwing', async () => {
  const config = defineBlogs([{
    id: 'broken', source: notionSource({ databaseId: 'db', tokenRef: 'MISSING_TOKEN' }),
    fieldMap: { title: 'title', date: 'date', excerpt: 'excerpt' },
  }])
  const views = await loadProjects(config, { env: () => undefined }, new Date('2026-08-16'))
  expect(views).toHaveLength(1)
  expect(views[0].error).toMatch(/MISSING_TOKEN/)
  expect(views[0].posts).toEqual([])
  expect(views[0].counts).toEqual({ draft: 0, scheduled: 0, published: 0 })
})
```

Add the missing import at the top of the file (next to the existing `defineBlogs, markdownSource`):

```ts
import { defineBlogs, markdownSource, notionSource } from '@postdeck/core'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/adapters/src/engine.test.ts`
Expected: FAIL — `loadProjects` is not exported.

- [ ] **Step 3: Rewrite `packages/adapters/src/engine.ts`**

```ts
import {
  resolveSource, toPost, groupTranslations,
  type BlogsConfig, type BlogConfig, type SourceDeps, type Post,
  type RawPost, type SourceCapabilities,
} from '@postdeck/core'

type Counts = { draft: number; scheduled: number; published: number }

export interface ProjectView {
  id: string
  name: string
  liveUrl?: string
  sourceType: 'notion' | 'markdown' | 'astro-collection'
  capabilities: SourceCapabilities
  posts: Post[]
  counts: Counts
  error?: string
}

// Shared: turn an adapter's raw list into normalized (and grouped) posts.
function normalizeRaws(raws: RawPost[], cfg: BlogConfig, now: Date): Post[] {
  let posts = raws.map((r) => {
    const post = toPost(r, cfg, now)
    // seed a single-lang variant so grouping can read the lang
    if (r.lang) post.variants = [{ lang: r.lang, status: post.status, publishDate: post.publishDate, present: true }]
    return post
  })
  if (cfg.groupTranslationsBy && cfg.source.type === 'astro-collection') {
    posts = groupTranslations(posts, cfg.source.langs)
  }
  return posts
}

function countByStatus(posts: Post[]): Counts {
  const c: Counts = { draft: 0, scheduled: 0, published: 0 }
  for (const p of posts) c[p.status]++
  return c
}

export async function loadPosts(
  config: BlogsConfig,
  deps: SourceDeps,
  now: Date = new Date(),
): Promise<Record<string, Post[]>> {
  const result: Record<string, Post[]> = {}
  for (const cfg of config) {
    const source = resolveSource(cfg, deps)
    result[cfg.id] = normalizeRaws(await source.list(), cfg, now)
  }
  return result
}

export async function loadProjects(
  config: BlogsConfig,
  deps: SourceDeps,
  now: Date = new Date(),
): Promise<ProjectView[]> {
  const views: ProjectView[] = []
  for (const cfg of config) {
    const base = {
      id: cfg.id,
      name: cfg.name ?? cfg.id,
      liveUrl: cfg.liveUrl,
      sourceType: cfg.source.type,
    }
    try {
      const source = resolveSource(cfg, deps)
      const posts = normalizeRaws(await source.list(), cfg, now)
      views.push({ ...base, capabilities: source.capabilities, posts, counts: countByStatus(posts) })
    } catch (e) {
      views.push({
        ...base,
        capabilities: { canWrite: false, enforcesFutureDates: false, supportsTranslations: false },
        posts: [],
        counts: { draft: 0, scheduled: 0, published: 0 },
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return views
}
```

- [ ] **Step 4: Export from `packages/adapters/src/index.ts`**

Replace the engine export line with:

```ts
export { loadPosts, loadProjects } from './engine.js'
export type { ProjectView } from './engine.js'
```

- [ ] **Step 5: Run tests — new + regression**

Run: `pnpm vitest run packages/adapters/src/engine.test.ts`
Expected: PASS (old `loadPosts` test + 2 new).
Run: `pnpm test`
Expected: PASS — all prior tests still green (30 total).

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/engine.ts packages/adapters/src/engine.test.ts packages/adapters/src/index.ts
git commit -m "feat(adapters): loadProjects — per-project view with counts, capabilities, error isolation"
```

---

## Task 2: localfs — filesystem-root store + ENOENT-only swallow

**Files:**
- Modify: `packages/adapters/src/localfs.ts`
- Test: `packages/adapters/src/localfs.test.ts` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `createLocalFs('/')` accepts absolute paths anywhere under `/`; `list()` returns `[]` only for ENOENT and rethrows other errors.

- [ ] **Step 1: Write the failing tests** (append to `localfs.test.ts`)

```ts
test('root store ("/") allows reading an absolute path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bm-root-'))
  writeFileSync(join(dir, 'x.txt'), 'hi', 'utf8')
  const fs = createLocalFs('/')
  expect(await fs.list(dir)).toContain('x.txt')
  expect(await fs.read(join(dir, 'x.txt'))).toBe('hi')
})

test('list returns [] for a missing dir (ENOENT)', async () => {
  const fs = createLocalFs('/')
  expect(await fs.list('/no/such/dir/postdeck-test')).toEqual([])
})
```

Ensure the test file imports `mkdtempSync, writeFileSync` from `node:fs`, `tmpdir` from `node:os`, `join` from `node:path`, and `createLocalFs` from `./localfs.js` (match the existing imports; add any missing).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/adapters/src/localfs.test.ts`
Expected: FAIL — the root-store test throws "path escapes root" (clamp rejects `//` prefix).

- [ ] **Step 3: Fix the clamp and narrow `list`** in `packages/adapters/src/localfs.ts`

Replace the `abs` helper and the `list` method:

```ts
  const abs = (p: string) => {
    const target = resolve(rootDir, p)
    const rootWithSep = rootDir.endsWith(sep) ? rootDir : rootDir + sep
    if (target !== rootDir && !target.startsWith(rootWithSep)) {
      throw new Error(`path escapes root: ${p}`)
    }
    return target
  }
```

```ts
    async list(dir) {
      try { return await readdir(abs(dir)) }
      catch (e: any) { if (e?.code === 'ENOENT') return []; throw e }
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/adapters/src/localfs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/localfs.ts packages/adapters/src/localfs.test.ts
git commit -m "fix(localfs): support filesystem-root store for multi-repo reads; narrow list() to ENOENT"
```

---

## Task 3: Carried-over test hardening + engines/typecheck infra

**Files:**
- Modify: `packages/core/src/status.test.ts` (append)
- Modify: `packages/core/src/translations.test.ts` (append)
- Modify: `package.json` (root), `packages/core/package.json`, `packages/adapters/package.json`

**Interfaces:** none new — additive tests + package metadata.

- [ ] **Step 1: Add precedence-collision status tests** (append to `packages/core/src/status.test.ts`)

```ts
test('draft flag + future date => draft (draft wins over scheduled)', () => {
  expect(normalizeStatus({ draftValue: true, publishDate: new Date('2026-12-01'), now })).toBe('draft')
})
test('allPublished + draft flag => published (allPublished wins)', () => {
  expect(normalizeStatus({ draftValue: true, publishDate: null, rule: { allPublished: true }, now })).toBe('published')
})
test('mixed-case status "Draft" (default rule) => draft', () => {
  expect(normalizeStatus({ statusValue: 'Draft', publishDate: null, now })).toBe('draft')
})
```

- [ ] **Step 2: Add translation primary-selection + absent-variant shape tests** (append to `packages/core/src/translations.test.ts`)

Match the existing import style in that file (it imports `groupTranslations` from `./index.js`). Add:

```ts
test('primary is the first present lang in langs order; absent langs get full absent shape', () => {
  const mk = (lang: string, slug: string, title: string) => ({
    id: `${lang}/${slug}`, project: 'reamly', title, slug,
    status: 'published' as const, publishDate: new Date('2026-01-01'),
    excerpt: '', tags: [] as string[], raw: {},
    variants: [{ lang, status: 'published' as const, publishDate: new Date('2026-01-01'), present: true }],
  })
  // langs order ['en','ko','ja'] but only ko+ja present -> primary should be ko (first present in order)
  const grouped = groupTranslations([mk('ja', 's', 'JA'), mk('ko', 's', 'KO')], ['en', 'ko', 'ja'])
  expect(grouped).toHaveLength(1)
  expect(grouped[0].title).toBe('KO')
  const en = grouped[0].variants!.find((v) => v.lang === 'en')!
  expect(en).toEqual({ lang: 'en', status: 'draft', publishDate: null, present: false })
})
```

- [ ] **Step 3: Run the new tests to verify they pass** (these assert already-correct behavior)

Run: `pnpm vitest run packages/core/src/status.test.ts packages/core/src/translations.test.ts`
Expected: PASS. (If any fail, that is a real bug — stop and report before changing source.)

- [ ] **Step 4: Add `engines` to all three package.json files and extend `typecheck`**

In root `package.json`, `packages/core/package.json`, and `packages/adapters/package.json` add (top level):

```json
"engines": { "node": ">=20" }
```

In root `package.json`, replace the `typecheck` script with (adapters transitively typechecks core via project refs already, but keep both explicit; dashboard/cli are checked by their own tooling):

```json
"typecheck": "tsc -p packages/core --noEmit && tsc -p packages/adapters --noEmit"
```

(unchanged content, but confirm it still passes after Tasks 1–2).

- [ ] **Step 5: Verify typecheck + full suite**

Run: `pnpm run typecheck`
Expected: clean (no output, exit 0).
Run: `pnpm test`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/status.test.ts packages/core/src/translations.test.ts package.json packages/core/package.json packages/adapters/package.json
git commit -m "test(core): status precedence + translation primary/absent shape; chore: engines node>=20"
```

---

## Task 4: Config loader in `@postdeck/adapters` (jiti + zod)

**Files:**
- Create: `packages/adapters/src/config-loader.ts`
- Create: `packages/adapters/src/config-loader.test.ts`
- Modify: `packages/adapters/src/index.ts`
- Modify: `packages/adapters/package.json` (add `jiti`)

**Interfaces:**
- Consumes: `blogsConfigSchema`, `BlogsConfig` from `@postdeck/core`.
- Produces:
  - `resolveConfigPath(cwd: string, explicit?: string): string` — returns absolute path. If `explicit` set, resolve it against `cwd`; else `<cwd>/blogs.config.ts`.
  - `loadBlogsConfig(configPath: string): Promise<BlogsConfig>` — jiti-imports the module, takes its default export, validates with `blogsConfigSchema`.

- [ ] **Step 1: Add jiti dependency**

Edit `packages/adapters/package.json` dependencies to include:

```json
"jiti": "^2.4.0"
```

Then install:

Run: `pnpm install`
Expected: adds jiti to the adapters package.

- [ ] **Step 2: Write the failing test** (`packages/adapters/src/config-loader.test.ts`)

```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from 'vitest'
import { resolveConfigPath, loadBlogsConfig } from './index.js'

test('resolveConfigPath defaults to <cwd>/blogs.config.ts', () => {
  expect(resolveConfigPath('/tmp/proj')).toBe(resolve('/tmp/proj', 'blogs.config.ts'))
})
test('resolveConfigPath honors an explicit path', () => {
  expect(resolveConfigPath('/tmp/proj', 'sub/custom.config.ts')).toBe(resolve('/tmp/proj', 'sub/custom.config.ts'))
})

test('loadBlogsConfig imports a TS config and validates it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bm-cfg-'))
  const file = join(dir, 'blogs.config.ts')
  writeFileSync(file, [
    `import { defineBlogs, markdownSource } from '@postdeck/core'`,
    `export default defineBlogs([`,
    `  { id: 'x', source: markdownSource({ dir: '/tmp/x' }),`,
    `    fieldMap: { title: 'title', date: 'date', excerpt: 'excerpt' } },`,
    `])`,
  ].join('\n'), 'utf8')
  const cfg = await loadBlogsConfig(file)
  expect(cfg).toHaveLength(1)
  expect(cfg[0].id).toBe('x')
  expect(cfg[0].source.type).toBe('markdown')
})

test('loadBlogsConfig rejects an invalid config', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bm-cfg-bad-'))
  const file = join(dir, 'blogs.config.ts')
  writeFileSync(file, `export default [{ id: 123 }]`, 'utf8')
  await expect(loadBlogsConfig(file)).rejects.toThrow()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/adapters/src/config-loader.test.ts`
Expected: FAIL — `resolveConfigPath`/`loadBlogsConfig` not exported.

- [ ] **Step 4: Implement `packages/adapters/src/config-loader.ts`**

```ts
import { resolve } from 'node:path'
import { createJiti } from 'jiti'
import { blogsConfigSchema, type BlogsConfig } from '@postdeck/core'

export function resolveConfigPath(cwd: string, explicit?: string): string {
  return resolve(cwd, explicit ?? 'blogs.config.ts')
}

export async function loadBlogsConfig(configPath: string): Promise<BlogsConfig> {
  const jiti = createJiti(import.meta.url, { interopDefault: true })
  const mod: any = await jiti.import(configPath)
  const value = mod?.default ?? mod
  return blogsConfigSchema.parse(value)
}
```

- [ ] **Step 5: Export from `packages/adapters/src/index.ts`**

Add:

```ts
export { resolveConfigPath, loadBlogsConfig } from './config-loader.js'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/adapters/src/config-loader.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/src/config-loader.ts packages/adapters/src/config-loader.test.ts packages/adapters/src/index.ts packages/adapters/package.json pnpm-lock.yaml
git commit -m "feat(adapters): loadBlogsConfig + resolveConfigPath (jiti + zod)"
```

---

## Task 5: Repo hygiene — gitignore, example config, `.env.example`, vitest reach

**Files:**
- Modify: `.gitignore`
- Create: `blogs.config.example.ts`
- Create: `.env.example`
- Modify: `vitest.config.ts`
- Create: `blogs.config.example.test.ts`

**Interfaces:**
- Consumes: `blogsConfigSchema` from `@postdeck/core`, config from `./blogs.config.example.ts`.
- Produces: committed placeholder example that parses against the schema; vitest now also runs `apps/**/*.test.ts`.

- [ ] **Step 1: Extend `.gitignore`** (append)

```
# real, user-owned config & secrets — never committed
blogs.config.ts
.env
.env.local
# next / build artifacts
apps/**/.next/
apps/**/next-env.d.ts
dist/
```

- [ ] **Step 2: Create `blogs.config.example.ts`** (committed, placeholders only)

```ts
import { defineBlogs, astroCollectionSource, markdownSource, notionSource } from '@postdeck/core'

// Copy this file to blogs.config.ts (gitignored) and fill in your real absolute
// paths + Notion database id. Secrets go in .env and are referenced by name.
export default defineBlogs([
  {
    id: 'reamly',
    name: 'Reamly',
    liveUrl: 'https://reamly.example/blog',
    source: astroCollectionSource({
      dir: '/absolute/path/to/reamly/apps/web/src/content/blog',
      langs: ['en', 'ko', 'ja', 'id'],
    }),
    fieldMap: { title: 'title', date: 'date', excerpt: 'description' },
    groupTranslationsBy: 'slug',
  },
  {
    id: 'freelance',
    name: 'Freelance Invoicer',
    liveUrl: 'https://freelance.example/guides',
    source: markdownSource({ dir: '/absolute/path/to/12_freelance-invoicer/content/guides' }),
    fieldMap: { title: 'title', date: 'datePublished', excerpt: 'description', slug: 'slug', updated: 'dateModified' },
    statusRule: { allPublished: true },
  },
  {
    id: 'hongix',
    name: 'Hongix',
    liveUrl: 'https://hongix.example/blog',
    // databaseId is read from .env so your private DB id never lands in git.
    source: notionSource({ databaseId: process.env.NOTION_DB ?? '', tokenRef: 'NOTION_TOKEN' }),
    fieldMap: { title: 'Title', date: 'Date', status: 'Status', excerpt: 'Excerpt', tags: 'Tags', slug: 'Slug' },
  },
])
```

- [ ] **Step 3: Create `.env.example`** (committed)

```
# Copy to .env (gitignored). Hongix Notion integration.
NOTION_TOKEN=secret_xxx
NOTION_DB=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 4: Extend vitest include** (`vitest.config.ts`) — reach into `apps/**` and the root-level example test:

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', '*.test.ts'] } })
```

- [ ] **Step 5: Write the example-parses test** (`blogs.config.example.test.ts`)

```ts
import { expect, test } from 'vitest'
import { blogsConfigSchema } from '@postdeck/core'
import example from './blogs.config.example.js'

test('blogs.config.example.ts is a valid config', () => {
  const parsed = blogsConfigSchema.parse(example)
  expect(parsed.map((b) => b.id)).toEqual(['reamly', 'freelance', 'hongix'])
})
```

(This root-level `*.test.ts` is picked up by the third include glob added in Step 4.)

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run blogs.config.example.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit** (note: `blogs.config.ts`/`.env` are ignored and NOT added)

```bash
git add .gitignore blogs.config.example.ts .env.example vitest.config.ts blogs.config.example.test.ts
git commit -m "chore: gitignore real config/env; add example config + .env.example; extend vitest reach"
```

---

## Task 6: Dashboard scaffold + server data layer

**Files:**
- Create: `apps/dashboard/package.json`, `apps/dashboard/next.config.mjs`, `apps/dashboard/tsconfig.json`
- Create: `apps/dashboard/app/layout.tsx`, `apps/dashboard/app/globals.css`
- Create: `apps/dashboard/lib/data.ts`

**Interfaces:**
- Consumes: `loadProjects`, `loadBlogsConfig`, `resolveConfigPath`, `createLocalFs`, `ProjectView` from `@postdeck/adapters`.
- Produces: `getProjects(): Promise<ProjectView[]>` (server-only), and a bootable Next app.

- [ ] **Step 1: Create `apps/dashboard/package.json`**

```json
{
  "name": "@postdeck/dashboard",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "@postdeck/core": "workspace:*",
    "@postdeck/adapters": "workspace:*",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 2: Create `apps/dashboard/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // core/adapters ship TS source (main -> src/index.ts); Next must transpile them.
  transpilePackages: ['@postdeck/core', '@postdeck/adapters'],
  // jiti is used at runtime to load blogs.config.ts; keep it external to the bundle.
  serverExternalPackages: ['jiti'],
}
export default nextConfig
```

- [ ] **Step 3: Create `apps/dashboard/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `apps/dashboard/lib/data.ts`**

```ts
import { loadProjects, loadBlogsConfig, resolveConfigPath, createLocalFs, type ProjectView } from '@postdeck/adapters'

// Server-only: reads local files (any repo) and Notion tokens.
// A filesystem-root store lets each blog use its own absolute path across repos.
export async function getProjects(): Promise<ProjectView[]> {
  const configPath = resolveConfigPath(process.cwd(), process.env.POSTDECK_CONFIG)
  const config = await loadBlogsConfig(configPath)
  const deps = {
    fileStore: createLocalFs('/'),
    env: (name: string) => process.env[name],
    fetchImpl: fetch,
  }
  return loadProjects(config, deps)
}
```

- [ ] **Step 5: Create `apps/dashboard/app/globals.css`**

```css
:root { --bg:#0b0c0e; --card:#16181d; --line:#262a31; --text:#e6e8ec; --dim:#8b909a;
  --pub:#3fb950; --sched:#d29922; --draft:#8b949e; --warn:#f0883e; --err:#f85149; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text);
  font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
a { color:inherit; }
.wrap { max-width:1100px; margin:0 auto; padding:24px; }
h1 { font-size:20px; margin:0 0 16px; }
h2 { font-size:15px; margin:24px 0 8px; color:var(--dim); text-transform:uppercase; letter-spacing:.04em; }
.cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:12px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px; }
.card h3 { margin:0 0 8px; font-size:15px; }
.counts { display:flex; gap:14px; }
.count b { font-size:18px; } .count span { color:var(--dim); font-size:12px; display:block; }
.badge { display:inline-block; font-size:11px; padding:1px 6px; border-radius:999px; border:1px solid var(--line); }
.badge.warn { color:var(--warn); border-color:var(--warn); }
.badge.missing { color:var(--err); border-color:var(--err); opacity:.8; }
.badge.present { color:var(--dim); }
.dot { width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:6px; }
.dot.published{background:var(--pub);} .dot.scheduled{background:var(--sched);} .dot.draft{background:var(--draft);}
.err { color:var(--err); font-size:13px; }
table { width:100%; border-collapse:collapse; }
td,th { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); font-weight:normal; vertical-align:top; }
th { color:var(--dim); font-size:12px; }
.cal { display:flex; flex-wrap:wrap; gap:6px; }
.cal .entry { background:var(--card); border:1px solid var(--line); border-radius:6px; padding:4px 8px; font-size:12px; }
.cal .entry .d { color:var(--dim); }
```

- [ ] **Step 6: Create `apps/dashboard/app/layout.tsx`**

```tsx
import './globals.css'
import type { ReactNode } from 'react'

export const metadata = { title: 'PostDeck' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><div className="wrap">{children}</div></body>
    </html>
  )
}
```

- [ ] **Step 7: Install and boot-smoke the scaffold**

Run: `pnpm install`
Expected: installs next/react for the dashboard.

Create a temporary throwaway `apps/dashboard/app/page.tsx` to prove it boots (it will be replaced in Task 8):

```tsx
import { getProjects } from '../lib/data.js'
export default async function Page() {
  const projects = await getProjects()
  return <pre>{JSON.stringify(projects.map((p) => ({ id: p.id, counts: p.counts, error: p.error })), null, 2)}</pre>
}
```

This needs a config. Defer the live boot to Task 10 (real config). For now just verify the build compiles:

Run: `pnpm --filter @postdeck/dashboard exec next build` (allow it to fail only at data-fetch/prerender for missing config; a TypeScript/module-resolution error is a real failure to fix). If prerender fails solely because no `blogs.config.ts` exists yet, that is expected — confirm there is no TS/import error above it.

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/package.json apps/dashboard/next.config.mjs apps/dashboard/tsconfig.json apps/dashboard/app/layout.tsx apps/dashboard/app/globals.css apps/dashboard/lib/data.ts apps/dashboard/app/page.tsx pnpm-lock.yaml
git commit -m "feat(dashboard): Next.js scaffold + server-side getProjects()"
```

---

## Task 7: Dashboard pure view helpers (badges + calendar)

**Files:**
- Create: `apps/dashboard/lib/badges.ts` (+ `apps/dashboard/lib/badges.test.ts`)
- Create: `apps/dashboard/lib/calendar.ts` (+ `apps/dashboard/lib/calendar.test.ts`)

**Interfaces:**
- Consumes (type-only): `SourceCapabilities`, `PostStatus`, `Post` from `@postdeck/core`; `ProjectView` from `@postdeck/adapters`.
- Produces:
  - `showsUnbuiltScheduledBadge(caps: SourceCapabilities, scheduledCount: number): boolean`
  - `variantBadgeClass(present: boolean): 'present' | 'missing'`
  - `interface CalendarEntry { date: string; project: string; title: string; status: PostStatus }`
  - `toCalendarEntries(projects: ProjectView[]): CalendarEntry[]`

- [ ] **Step 1: Write the failing tests**

`apps/dashboard/lib/badges.test.ts`:

```ts
import { expect, test } from 'vitest'
import { showsUnbuiltScheduledBadge, variantBadgeClass } from './badges.js'

const caps = (enforcesFutureDates: boolean) => ({ canWrite: true, enforcesFutureDates, supportsTranslations: false })

test('unbuilt-scheduled badge shows only when the source does not enforce future dates AND there are scheduled posts', () => {
  expect(showsUnbuiltScheduledBadge(caps(false), 2)).toBe(true)
  expect(showsUnbuiltScheduledBadge(caps(false), 0)).toBe(false)
  expect(showsUnbuiltScheduledBadge(caps(true), 2)).toBe(false)
})
test('variantBadgeClass maps presence to a css class', () => {
  expect(variantBadgeClass(true)).toBe('present')
  expect(variantBadgeClass(false)).toBe('missing')
})
```

`apps/dashboard/lib/calendar.test.ts`:

```ts
import { expect, test } from 'vitest'
import { toCalendarEntries } from './calendar.js'
import type { ProjectView } from '@postdeck/adapters'

const post = (title: string, date: string | null) => ({
  id: title, project: 'p', title, slug: title, status: 'published' as const,
  publishDate: date ? new Date(date) : null, excerpt: '', tags: [] as string[], raw: {},
})
const view = (posts: any[]): ProjectView => ({
  id: 'p', name: 'P', sourceType: 'markdown',
  capabilities: { canWrite: true, enforcesFutureDates: false, supportsTranslations: false },
  posts, counts: { draft: 0, scheduled: 0, published: posts.length },
})

test('toCalendarEntries drops null dates and sorts ascending by date', () => {
  const entries = toCalendarEntries([view([post('B', '2026-05-01'), post('A', '2026-01-01'), post('N', null)])])
  expect(entries.map((e) => e.title)).toEqual(['A', 'B'])
  expect(entries[0]).toEqual({ date: '2026-01-01', project: 'P', title: 'A', status: 'published' })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/dashboard/lib`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `apps/dashboard/lib/badges.ts`**

```ts
import type { SourceCapabilities } from '@postdeck/core'

export function showsUnbuiltScheduledBadge(caps: SourceCapabilities, scheduledCount: number): boolean {
  return scheduledCount > 0 && caps.enforcesFutureDates === false
}

export function variantBadgeClass(present: boolean): 'present' | 'missing' {
  return present ? 'present' : 'missing'
}
```

- [ ] **Step 4: Implement `apps/dashboard/lib/calendar.ts`**

```ts
import type { PostStatus } from '@postdeck/core'
import type { ProjectView } from '@postdeck/adapters'

export interface CalendarEntry {
  date: string
  project: string
  title: string
  status: PostStatus
}

export function toCalendarEntries(projects: ProjectView[]): CalendarEntry[] {
  const entries: CalendarEntry[] = []
  for (const proj of projects) {
    for (const p of proj.posts) {
      if (!p.publishDate) continue
      entries.push({ date: p.publishDate.toISOString().slice(0, 10), project: proj.name, title: p.title, status: p.status })
    }
  }
  return entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run apps/dashboard/lib`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/lib/badges.ts apps/dashboard/lib/badges.test.ts apps/dashboard/lib/calendar.ts apps/dashboard/lib/calendar.test.ts
git commit -m "feat(dashboard): pure badge + calendar helpers with unit tests"
```

---

## Task 8: Dashboard components + page wiring

**Files:**
- Create: `apps/dashboard/components/VariantBadges.tsx`, `components/ProjectCard.tsx`, `components/PostList.tsx`, `components/Calendar.tsx`
- Modify: `apps/dashboard/app/page.tsx` (replace the throwaway from Task 6)

**Interfaces:**
- Consumes: `getProjects` (lib/data), helpers from lib/badges + lib/calendar, `ProjectView` from `@postdeck/adapters`, `Post`/`PostVariant` from `@postdeck/core`.
- Produces: the full `/` page (server component) rendering cards + calendar + per-project lists.

- [ ] **Step 1: `components/VariantBadges.tsx`**

```tsx
import type { PostVariant } from '@postdeck/core'
import { variantBadgeClass } from '../lib/badges.js'

export function VariantBadges({ variants }: { variants?: PostVariant[] }) {
  if (!variants || variants.length === 0) return null
  return (
    <span>
      {variants.map((v) => (
        <span key={v.lang} className={`badge ${variantBadgeClass(v.present)}`} style={{ marginRight: 4 }}
          title={v.present ? `${v.lang}: ${v.status}` : `${v.lang}: 누락`}>
          {v.lang}{v.present ? '' : '·누락'}
        </span>
      ))}
    </span>
  )
}
```

- [ ] **Step 2: `components/ProjectCard.tsx`**

```tsx
import type { ProjectView } from '@postdeck/adapters'
import { showsUnbuiltScheduledBadge } from '../lib/badges.js'

export function ProjectCard({ project }: { project: ProjectView }) {
  const p = project
  return (
    <div className="card">
      <h3>{p.liveUrl ? <a href={p.liveUrl} target="_blank" rel="noreferrer">{p.name}</a> : p.name}</h3>
      {p.error ? (
        <div className="err">⚠ {p.error}</div>
      ) : (
        <div className="counts">
          <div className="count"><b>{p.counts.published}</b><span>발행</span></div>
          <div className="count">
            <b>{p.counts.scheduled}</b>
            <span>예약{showsUnbuiltScheduledBadge(p.capabilities, p.counts.scheduled) ? ' ' : ''}</span>
            {showsUnbuiltScheduledBadge(p.capabilities, p.counts.scheduled) && (
              <span className="badge warn" title="이 소스의 빌드는 미래 날짜를 실제로 거르지 않습니다">빌드 미반영</span>
            )}
          </div>
          <div className="count"><b>{p.counts.draft}</b><span>초안</span></div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: `components/PostList.tsx`**

```tsx
import type { ProjectView } from '@postdeck/adapters'
import { VariantBadges } from './VariantBadges.js'

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—')

export function PostList({ project }: { project: ProjectView }) {
  if (project.error) return null
  return (
    <div>
      <h2>{project.name}</h2>
      <table>
        <thead><tr><th>제목</th><th>상태</th><th>발행일</th><th>언어</th></tr></thead>
        <tbody>
          {project.posts.map((post) => (
            <tr key={post.id}>
              <td>{post.liveUrl ? <a href={post.liveUrl} target="_blank" rel="noreferrer">{post.title}</a> : post.title}</td>
              <td><span className={`dot ${post.status}`} />{post.status}</td>
              <td>{fmt(post.publishDate)}</td>
              <td><VariantBadges variants={post.variants} /></td>
            </tr>
          ))}
          {project.posts.length === 0 && <tr><td colSpan={4} className="err">글 없음</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: `components/Calendar.tsx`**

```tsx
import type { ProjectView } from '@postdeck/adapters'
import { toCalendarEntries } from '../lib/calendar.js'

export function Calendar({ projects }: { projects: ProjectView[] }) {
  const entries = toCalendarEntries(projects)
  if (entries.length === 0) return <p className="err">날짜가 있는 글이 없습니다.</p>
  return (
    <div className="cal">
      {entries.map((e, i) => (
        <span key={i} className="entry" title={`${e.project} · ${e.status}`}>
          <span className="d">{e.date}</span> <span className={`dot ${e.status}`} />{e.title}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Replace `apps/dashboard/app/page.tsx`**

```tsx
import { getProjects } from '../lib/data.js'
import { ProjectCard } from '../components/ProjectCard.js'
import { Calendar } from '../components/Calendar.js'
import { PostList } from '../components/PostList.js'

export const dynamic = 'force-dynamic'  // always read fresh from disk/Notion

export default async function Page() {
  const projects = await getProjects()
  return (
    <main>
      <h1>PostDeck</h1>
      <h2>프로젝트</h2>
      <div className="cards">
        {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
      </div>
      <h2>캘린더</h2>
      <Calendar projects={projects} />
      <h2>글 목록</h2>
      {projects.map((p) => <PostList key={p.id} project={p} />)}
    </main>
  )
}
```

- [ ] **Step 6: Verify helper tests + typecheck still pass**

Run: `pnpm vitest run apps/dashboard/lib`
Expected: PASS.
Run: `pnpm run typecheck`
Expected: clean (packages only; dashboard tsx is checked by Next during the Task 10 boot).

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/components apps/dashboard/app/page.tsx
git commit -m "feat(dashboard): project cards + calendar + post lists with honesty/variant badges"
```

---

## Task 9: CLI — `npx postdeck` boots the dashboard

**Files:**
- Create: `apps/cli/package.json`, `apps/cli/bin/postdeck.mjs`, `apps/cli/src/main.ts`, `apps/cli/src/args.ts`
- Create: `apps/cli/src/args.test.ts`

**Interfaces:**
- Consumes: `resolveConfigPath`, `loadBlogsConfig` from `@postdeck/adapters`.
- Produces:
  - `parseArgs(argv: string[]): { config?: string; port: number; open: boolean }`
  - `main(): Promise<void>` — resolves+validates config, spawns `next dev` with `POSTDECK_CONFIG`, opens browser unless `--no-open`.

- [ ] **Step 1: Create `apps/cli/package.json`**

```json
{
  "name": "postdeck",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "bin": { "postdeck": "./bin/postdeck.mjs" },
  "dependencies": {
    "@postdeck/core": "workspace:*",
    "@postdeck/adapters": "workspace:*",
    "@postdeck/dashboard": "workspace:*",
    "dotenv": "^16.4.0",
    "jiti": "^2.4.0"
  }
}
```

- [ ] **Step 2: Write the failing test** (`apps/cli/src/args.test.ts`)

```ts
import { expect, test } from 'vitest'
import { parseArgs } from './args.js'

test('defaults: port 3000, open true, no explicit config', () => {
  expect(parseArgs([])).toEqual({ config: undefined, port: 3000, open: true })
})
test('--port sets the port', () => {
  expect(parseArgs(['--port', '4123']).port).toBe(4123)
})
test('--no-open disables opening the browser', () => {
  expect(parseArgs(['--no-open']).open).toBe(false)
})
test('--config path is captured', () => {
  expect(parseArgs(['--config', 'custom.ts']).config).toBe('custom.ts')
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run apps/cli/src/args.test.ts`
Expected: FAIL — `./args.js` not found.

- [ ] **Step 4: Implement `apps/cli/src/args.ts`**

```ts
export interface CliArgs {
  config?: string
  port: number
  open: boolean
}

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { config: undefined, port: 3000, open: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port') out.port = Number(argv[++i])
    else if (a === '--no-open') out.open = false
    else if (a === '--config') out.config = argv[++i]
  }
  return out
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run apps/cli/src/args.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Implement `apps/cli/src/main.ts`**

```ts
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { config as loadDotenv } from 'dotenv'
import { resolveConfigPath, loadBlogsConfig } from '@postdeck/adapters'
import { parseArgs } from './args.js'

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const cwd = process.cwd()

  // Load .env from cwd so config's process.env.* refs (e.g. NOTION_DB) resolve,
  // and so the spawned dashboard inherits the same secrets.
  loadDotenv({ path: resolve(cwd, '.env') })

  const configPath = resolveConfigPath(cwd, args.config)
  if (!existsSync(configPath)) {
    console.error(`postdeck: no config found at ${configPath}\nCreate blogs.config.ts (see blogs.config.example.ts).`)
    process.exit(1)
  }
  // Validate early so the user gets a clear error before Next boots.
  await loadBlogsConfig(configPath)

  // Dashboard app dir = this package's node_modules/@postdeck/dashboard resolved to source.
  const here = dirname(fileURLToPath(import.meta.url))
  const dashboardDir = resolve(here, '../../dashboard') // apps/cli/src -> apps/dashboard

  const url = `http://localhost:${args.port}`
  console.log(`postdeck: booting dashboard at ${url} (config: ${configPath})`)

  const child = spawn('pnpm', ['exec', 'next', 'dev', '--port', String(args.port)], {
    cwd: dashboardDir,
    env: { ...process.env, POSTDECK_CONFIG: configPath },
    stdio: 'inherit',
  })

  if (args.open && process.platform === 'darwin') {
    setTimeout(() => spawn('open', [url], { stdio: 'ignore' }), 2500)
  }
  child.on('exit', (code) => process.exit(code ?? 0))
}
```

- [ ] **Step 7: Implement `apps/cli/bin/postdeck.mjs`** (TS bootstrap via jiti so it runs without a build step)

```js
#!/usr/bin/env node
import { createJiti } from 'jiti'
const jiti = createJiti(import.meta.url, { interopDefault: true })
const { main } = await jiti.import('../src/main.ts')
await main()
```

- [ ] **Step 8: Install and typecheck the args module**

Run: `pnpm install`
Expected: links `postdeck` bin + deps.
Run: `pnpm vitest run apps/cli/src/args.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/cli/package.json apps/cli/bin/postdeck.mjs apps/cli/src/main.ts apps/cli/src/args.ts apps/cli/src/args.test.ts pnpm-lock.yaml
git commit -m "feat(cli): postdeck — load+validate config, spawn next dev, open browser"
```

---

## Task 10: Real config wiring + end-to-end verification

**Files:**
- Create (gitignored, NOT committed): `blogs.config.ts`, `.env`

**Interfaces:** none new — this task proves the whole stack against real blogs.

> The real absolute paths and Notion database id are NOT written in this committed plan (OSS hygiene). They are supplied at execution time. Values for this repo's owner:
> - `<PROD_LINE>` = the local production-line base for reamly + freelance.
> - reamly dir = `<PROD_LINE>/reamly/apps/web/src/content/blog`, langs `['en','ko','ja','id']`.
> - freelance dir = `<PROD_LINE>/12_freelance-invoicer/content/guides`.
> - hongix = Notion; `NOTION_TOKEN` + `NOTION_DB` copied from the hongix-site `.env`.

- [ ] **Step 1: Create the gitignored `.env`** at repo root with real values:

```
NOTION_TOKEN=<real token>
NOTION_DB=<real database id>
```

- [ ] **Step 2: Create the gitignored `blogs.config.ts`** at repo root by copying `blogs.config.example.ts` and replacing the placeholder `dir` values with the real absolute paths above (reamly + freelance). Keep the hongix `notionSource({ databaseId: process.env.NOTION_DB ?? '', tokenRef: 'NOTION_TOKEN' })` line as-is. Confirm the freelance `fieldMap` matches its real frontmatter: `{ title:'title', date:'datePublished', excerpt:'description', slug:'slug', updated:'dateModified' }`, and reamly `{ title:'title', date:'date', excerpt:'description' }` with `groupTranslationsBy:'slug'`.

- [ ] **Step 3: Confirm it stays untracked**

Run: `git status --porcelain`
Expected: neither `blogs.config.ts` nor `.env` appears (both gitignored).

- [ ] **Step 4: Boot via the CLI**

Run: `node apps/cli/bin/postdeck.mjs --port 3300 --no-open`
Expected: logs "booting dashboard at http://localhost:3300"; Next dev compiles without TS/module errors.

- [ ] **Step 5: Verify the three views in the browser** (open `http://localhost:3300`)

Confirm by observation (report what you see):
- **Cards**: reamly + freelance show real published counts; freelance's card shows `초안 0` (allPublished). If reamly has any future-dated post, the 예약 count carries the **빌드 미반영** badge. hongix either shows real counts (if `NOTION_TOKEN`/`NOTION_DB` valid) or an **error card** — either outcome proves per-project isolation (the board still renders reamly + freelance).
- **Calendar**: entries sorted by date; past vs future distinguishable by status dot color.
- **Post list**: reamly rows show per-language variant badges; any missing language shows the dimmed `·누락` badge.

- [ ] **Step 6: Verify the full automated suite once more**

Run: `pnpm test`
Expected: PASS — all package + app helper tests green.
Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit the progress ledger update only** (no real config/secrets)

Update `.superpowers/sdd/progress.md` (or create a Phase 2 section) noting Tasks 1–10 complete, then:

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs: Phase 2 progress — dashboard + CLI complete, verified against real blogs"
```

Note: `.superpowers/` is currently gitignored (see `.gitignore`). If it is meant to be tracked, un-ignore it in the same commit; otherwise keep the ledger local and skip this commit.

---

## Self-Review

**Spec coverage (against `2026-08-16-phase2-dashboard-cli-spec.md`):**
- §1.1 `loadProjects` + `ProjectView` + capabilities + per-project error isolation → Task 1. ✓
- §1.2 dashboard 3 views (cards + calendar + list), honesty badge, variant "누락" badge, read-only, no `read()` → Tasks 6–8. ✓
- §1.3 real 3-blog config, hongix=Notion via env, absolute paths, secrets in `.env` → Tasks 5 (example) + 10 (real). ✓
- §1.4 CLI jiti-load + validate + spawn next dev + open → Task 9. ✓
- §2 carried-over: status precedence + translation shape tests (Task 3), localfs ENOENT narrowing (Task 2), engines/typecheck (Task 3); `read()`/CI deferred (stated). ✓
- §4 OSS hygiene: gitignore real config/env, example files, placeholder docs → Task 5 + Task 10 note. ✓
- §5 testing: loadProjects (counts/caps/isolation), badge logic, config parse, regression → Tasks 1,3,4,5,7. ✓

**Placeholder scan:** No "TBD"/"implement later"/vague-handwave steps; every code step shows full content. Real machine paths intentionally deferred to execution-time in Task 10 (OSS hygiene, explicitly noted) — not a plan gap.

**Type consistency:** `ProjectView` shape identical across Task 1 (definition), Task 7 (calendar consumer), Task 8 (components), Task 9 (n/a). `showsUnbuiltScheduledBadge(caps, scheduledCount)` signature identical in Task 7 def and Task 8 use. `resolveConfigPath(cwd, explicit?)` / `loadBlogsConfig(path)` identical in Task 4 def and Tasks 6/9 use. `parseArgs` return shape identical in Task 9 def/test/use. `createLocalFs('/')` root-store behavior established in Task 2, relied on in Task 6.

**Ordering:** T1 (engine) → T2 (localfs) → T3 (hardening) → T4 (loader) → T5 (hygiene/examples) → T6–8 (dashboard) → T9 (CLI) → T10 (real wiring + verify). Dashboard depends on T1/T4/T5; CLI depends on T4/T6; verify depends on all. ✓
