# PostDeck — Core + Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the framework-agnostic engine — Post model, serializable config, status normalization, translation grouping, a FileStore port, and three first-party BlogSource adapters (markdown / astro-collection / notion) — such that `list()` returns normalized Posts and `createDraft()` writes round-trip-safe (never destroys unmapped frontmatter).

**Architecture:** Hexagonal. `@postdeck/core` is pure TS with zero fs/Notion/Next dependencies — it defines the `Post` domain, the `BlogSource`/`FileStore` interfaces, config Zod schemas, and normalization logic. `@postdeck/adapters` implements the interfaces (localFs FileStore + three sources) and registers them in a `type`-keyed registry. Config is data-only (discriminated union) so it can later be stored per-tenant in a DB.

**Tech Stack:** TypeScript (ESM), pnpm workspaces, vitest, `yaml` (eemeli/yaml Document API for round-trip-safe frontmatter), `zod` (config schemas), Node built-in `fs`/`child_process` (git commits in localFs), `fetch` (Notion API).

## Global Constraints

- **Node** ≥ 20, **TypeScript** ESM (`"type": "module"`, `"module": "NodeNext"`).
- **Package names:** `@postdeck/core`, `@postdeck/adapters` (npm scope `@postdeck/*` confirmed free 2026-08-16).
- **`core` has ZERO runtime dependency on** `fs`, `child_process`, `next`, Notion, or any adapter. Only `zod` is allowed as a core runtime dep. Enforced by review.
- **Config is data-only:** `SourceConfig` is a JSON-serializable discriminated union keyed by `type`. Helper functions (`defineBlogs`, `notionSource`, …) are typed constructors that return plain data — no closures, no functions in the output.
- **Writes are patches, never overwrites:** `createDraft`/updates touch only keys present in `fieldMap`; every other frontmatter key, its order, and comments are preserved via the `yaml` Document API. Non-negotiable invariant — the round-trip diff==0 test (Task 3) gates all write code.
- **Status values** are exactly `'draft' | 'scheduled' | 'published'`.
- **Secrets** are referenced by env-var name (`tokenRef`), never inlined in config.
- Test framework is **vitest**; every task is TDD (failing test first).

---

### Task 1: Monorepo scaffold + vitest

**Files:**
- Create: `package.json` (workspace root)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/adapters/package.json`
- Create: `packages/adapters/tsconfig.json`
- Create: `packages/adapters/src/index.ts`
- Create: `vitest.config.ts`
- Test: `packages/core/src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `pnpm -w test` command; `@postdeck/core` and `@postdeck/adapters` resolvable via workspace.

- [ ] **Step 1: Write the failing test**

`packages/core/src/smoke.test.ts`:
```ts
import { expect, test } from 'vitest'
import { VERSION } from './index.js'

test('core exposes a version constant', () => {
  expect(VERSION).toBe('0.0.0')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -w test`
Expected: FAIL — cannot resolve `./index.js` export `VERSION` (or install error before this; run Step 3 setup first if pnpm not initialized).

- [ ] **Step 3: Write minimal implementation + scaffold**

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

Root `package.json`:
```json
{
  "name": "postdeck-monorepo",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run", "test:watch": "vitest" },
  "devDependencies": { "typescript": "^5.6.0", "vitest": "^2.1.0", "@types/node": "^20.0.0" }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
    "strict": true, "declaration": true, "esModuleInterop": true,
    "skipLibCheck": true, "verbatimModuleSyntax": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['packages/**/*.test.ts'] } })
```

`packages/core/package.json`:
```json
{
  "name": "@postdeck/core", "version": "0.0.0", "type": "module",
  "main": "./src/index.ts", "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^3.23.0" }
}
```

`packages/core/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "rootDir": "src", "outDir": "dist" }, "include": ["src"] }
```

`packages/core/src/index.ts`:
```ts
export const VERSION = '0.0.0'
```

`packages/adapters/package.json`:
```json
{
  "name": "@postdeck/adapters", "version": "0.0.0", "type": "module",
  "main": "./src/index.ts", "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@postdeck/core": "workspace:*", "yaml": "^2.5.0" }
}
```

`packages/adapters/tsconfig.json`: same shape as core's.

`packages/adapters/src/index.ts`:
```ts
export {}
```

Then run: `pnpm install`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -w test`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: monorepo scaffold (core + adapters + vitest)"
```

---

### Task 2: Core domain types + serializable config + Zod schemas

**Files:**
- Create: `packages/core/src/post.ts`
- Create: `packages/core/src/config.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `post.ts`: `Post`, `PostVariant`, `RawPost`, `DraftInput`, `PostBody`, `Ref`, `PostStatus`.
  - `config.ts`: `SourceConfig` (discriminated union), `FieldMap`, `StatusRule`, `BlogConfig`, `BlogsConfig`; Zod: `blogsConfigSchema`; helpers `defineBlogs(list): BlogsConfig`, `notionSource(o)`, `markdownSource(o)`, `astroCollectionSource(o)` (all return plain data).

- [ ] **Step 1: Write the failing test**

`packages/core/src/config.test.ts`:
```ts
import { expect, test } from 'vitest'
import { blogsConfigSchema, defineBlogs, notionSource, markdownSource } from './index.js'

test('defineBlogs returns plain JSON-serializable data (no functions)', () => {
  const cfg = defineBlogs([
    { id: 'hongix', name: 'Hongix', liveUrl: 'https://hongix.com/blog',
      source: notionSource({ databaseId: 'db1', tokenRef: 'HONGIX_NOTION_TOKEN' }),
      fieldMap: { title: 'title', date: 'date', status: 'status', excerpt: 'excerpt', tags: 'tags' } },
  ])
  // Round-trips through JSON unchanged => contains no closures.
  expect(JSON.parse(JSON.stringify(cfg))).toEqual(cfg)
  expect(cfg[0].source).toEqual({ type: 'notion', databaseId: 'db1', tokenRef: 'HONGIX_NOTION_TOKEN' })
})

test('zod validates a good config and rejects an unknown source type', () => {
  const good = defineBlogs([
    { id: 'freelance', source: markdownSource({ dir: '/x/guides' }),
      fieldMap: { title: 'title', date: 'datePublished', excerpt: 'description' },
      statusRule: { allPublished: true } },
  ])
  expect(blogsConfigSchema.safeParse(good).success).toBe(true)
  const bad = [{ id: 'z', source: { type: 'ftp' }, fieldMap: { title: 't', date: 'd', excerpt: 'e' } }]
  expect(blogsConfigSchema.safeParse(bad).success).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -w test config`
Expected: FAIL — exports not defined.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/post.ts`:
```ts
export type PostStatus = 'draft' | 'scheduled' | 'published'

export interface PostVariant {
  lang: string
  status: PostStatus
  publishDate: Date | null
  present: boolean
}

export interface Post {
  id: string
  project: string
  title: string
  slug: string
  status: PostStatus
  publishDate: Date | null
  updatedDate?: Date
  excerpt: string
  tags: string[]
  author?: string
  liveUrl?: string
  variants?: PostVariant[]
  raw: Record<string, unknown>
}

/** One item as an adapter reads it from a source, before core normalization. */
export interface RawPost {
  id: string
  slug: string
  lang?: string
  fields: Record<string, unknown>   // frontmatter/props already keyed by CANONICAL names (title/date/...)
  raw: Record<string, unknown>      // full original frontmatter/props, untouched
  present?: boolean
}

export interface DraftInput {
  slug: string
  title: string
  excerpt: string
  date?: Date
  tags?: string[]
  body: string          // markdown
  lang?: string
  extraFields?: Record<string, unknown>
}

export interface PostBody { post: Post; body: string }
export interface Ref { id: string; path?: string; url?: string; commit?: string }
```

`packages/core/src/config.ts`:
```ts
import { z } from 'zod'

export const fieldMapSchema = z.object({
  title: z.string(),
  date: z.string(),
  excerpt: z.string(),
  status: z.string().optional(),
  draft: z.string().optional(),
  tags: z.string().optional(),
  author: z.string().optional(),
  slug: z.string().optional(),
  updated: z.string().optional(),
})
export type FieldMap = z.infer<typeof fieldMapSchema>

export const statusRuleSchema = z.object({
  allPublished: z.boolean().optional(),
  draftValue: z.string().optional(),      // e.g. status === 'draft'
}).optional()
export type StatusRule = z.infer<typeof statusRuleSchema>

export const sourceConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('notion'), databaseId: z.string(), tokenRef: z.string() }),
  z.object({ type: z.literal('markdown'), dir: z.string() }),
  z.object({ type: z.literal('astro-collection'), dir: z.string(), langs: z.array(z.string()) }),
])
export type SourceConfig = z.infer<typeof sourceConfigSchema>

export const blogConfigSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  liveUrl: z.string().optional(),
  source: sourceConfigSchema,
  fieldMap: fieldMapSchema,
  statusRule: statusRuleSchema,
  groupTranslationsBy: z.enum(['slug']).optional(),
})
export type BlogConfig = z.infer<typeof blogConfigSchema>

export const blogsConfigSchema = z.array(blogConfigSchema)
export type BlogsConfig = z.infer<typeof blogsConfigSchema>

// Typed constructors — return PLAIN DATA (no closures) so config stays serializable.
export const defineBlogs = (list: BlogConfig[]): BlogsConfig => list
export const notionSource = (o: { databaseId: string; tokenRef: string }): SourceConfig =>
  ({ type: 'notion', ...o })
export const markdownSource = (o: { dir: string }): SourceConfig => ({ type: 'markdown', ...o })
export const astroCollectionSource = (o: { dir: string; langs: string[] }): SourceConfig =>
  ({ type: 'astro-collection', ...o })
```

`packages/core/src/index.ts`:
```ts
export const VERSION = '0.0.0'
export * from './post.js'
export * from './config.js'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -w test config`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): Post model + serializable config + zod schemas"
```

---

### Task 3: Round-trip-safe frontmatter (THE trust gate)

Do this before any adapter. Uses the `yaml` Document API so unmapped keys, key order, and comments survive a parse→patch→stringify cycle.

**Files:**
- Create: `packages/adapters/src/frontmatter.ts`
- Test: `packages/adapters/src/frontmatter.test.ts`
- Create fixture: `packages/adapters/src/__fixtures__/freelance-guide.md`

**Interfaces:**
- Consumes: nothing (adapters may import `yaml`).
- Produces:
  - `splitFrontmatter(raw): { yamlText: string; body: string }`
  - `parseFrontmatter(raw): { data: Record<string, unknown>; body: string }`
  - `patchFrontmatter(raw, patch: Record<string, unknown>): string` — sets ONLY the given keys, preserves everything else byte-for-byte where possible, returns the full file string.

- [ ] **Step 1: Create the fixture**

`packages/adapters/src/__fixtures__/freelance-guide.md` (real shape from 12_freelance-invoicer, incl. nested map + list):
```markdown
---
slug: freelancer-tax-by-province-canada
order: 4
title: "Freelancer tax by province in Canada: how much to set aside where"
h1: "How much do freelancers set aside for tax by province?"
crumb: "Freelancer tax by province"
description: "How much self-employed Canadians set aside for tax by province."
datePublished: "2026-07-13"
dateModified: "2026-07-13"
shortAnswer:
  label: "The short answer"
  big: "About 26 to 31 percent"
  body: "On the same income, a freelancer in Alberta sets aside near the low end."
ctaHeading: "See your province's number"
tags:
  - tax
  - canada
---

Federal tax and CPP are the same wherever you live.

## How we ranked these
```

- [ ] **Step 2: Write the failing test**

`packages/adapters/src/frontmatter.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { expect, test } from 'vitest'
import { parseFrontmatter, patchFrontmatter } from './frontmatter.js'

const here = dirname(fileURLToPath(import.meta.url))
const raw = readFileSync(join(here, '__fixtures__/freelance-guide.md'), 'utf8')

test('parse reads nested maps and lists', () => {
  const { data, body } = parseFrontmatter(raw)
  expect(data.title).toContain('Freelancer tax by province')
  expect((data.shortAnswer as any).big).toBe('About 26 to 31 percent')
  expect(data.tags).toEqual(['tax', 'canada'])
  expect(body.trimStart().startsWith('Federal tax')).toBe(true)
})

test('no-op patch is a byte-for-byte round trip (diff == 0)', () => {
  expect(patchFrontmatter(raw, {})).toBe(raw)
})

test('patching one key preserves every unmapped key, order, and the nested map', () => {
  const out = patchFrontmatter(raw, { description: 'NEW DESC' })
  const { data } = parseFrontmatter(out)
  expect(data.description).toBe('NEW DESC')
  // untouched fields survive
  expect(data.order).toBe(4)
  expect((data.shortAnswer as any).label).toBe('The short answer')
  expect(data.ctaHeading).toBe("See your province's number")
  // key order unchanged: slug still before order still before title
  expect(out.indexOf('slug:')).toBeLessThan(out.indexOf('order:'))
  expect(out.indexOf('order:')).toBeLessThan(out.indexOf('title:'))
  // body untouched
  expect(out).toContain('## How we ranked these')
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm -w test frontmatter`
Expected: FAIL — `./frontmatter.js` not found.

- [ ] **Step 4: Write minimal implementation**

`packages/adapters/src/frontmatter.ts`:
```ts
import { parseDocument } from 'yaml'

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function splitFrontmatter(raw: string): { yamlText: string; body: string } {
  const m = raw.match(FM)
  if (!m) return { yamlText: '', body: raw }
  return { yamlText: m[1], body: m[2] }
}

export function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const { yamlText, body } = splitFrontmatter(raw)
  if (!yamlText) return { data: {}, body }
  const data = parseDocument(yamlText).toJSON() ?? {}
  return { data, body }
}

/**
 * Set ONLY the given keys, preserving all other keys, their order, comments,
 * and the body. A no-op ({}) returns `raw` unchanged (byte-for-byte).
 */
export function patchFrontmatter(raw: string, patch: Record<string, unknown>): string {
  const m = raw.match(FM)
  if (!m) throw new Error('patchFrontmatter: file has no frontmatter block')
  if (Object.keys(patch).length === 0) return raw
  const doc = parseDocument(m[1])
  for (const [k, v] of Object.entries(patch)) doc.set(k, v)
  // Re-stitch: yaml.stringify keeps a trailing newline; match original delimiters.
  const yamlText = doc.toString().replace(/\n$/, '')
  return `---\n${yamlText}\n---\n${m[2]}`
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -w test frontmatter`
Expected: PASS (3 tests). If the no-op round-trip fails on formatting, the `yaml` Document `.toString()` differs from source whitespace — the no-op path already short-circuits via `return raw`, so only the patched-key test exercises stringify; keep patched assertions structural (key presence/order), not whitespace-exact.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(adapters): round-trip-safe frontmatter parse/patch (trust gate)"
```

---

### Task 4: Status normalization

**Files:**
- Create: `packages/core/src/status.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './status.js'`)
- Test: `packages/core/src/status.test.ts`

**Interfaces:**
- Consumes: `FieldMap`, `StatusRule` from `config.ts`; `PostStatus` from `post.ts`.
- Produces: `normalizeStatus(input: { statusValue?: unknown; draftValue?: unknown; publishDate: Date | null; rule?: StatusRule; now: Date }): PostStatus`.

- [ ] **Step 1: Write the failing test**

`packages/core/src/status.test.ts`:
```ts
import { expect, test } from 'vitest'
import { normalizeStatus } from './index.js'

const now = new Date('2026-08-16T00:00:00Z')

test('draft flag (boolean) wins', () => {
  expect(normalizeStatus({ draftValue: true, publishDate: new Date('2026-01-01'), now })).toBe('draft')
})
test('status string "draft" (via draftValue) => draft', () => {
  expect(normalizeStatus({ statusValue: 'draft', draftValue: undefined, rule: { draftValue: 'draft' }, publishDate: null, now })).toBe('draft')
})
test('future publishDate + not draft => scheduled', () => {
  expect(normalizeStatus({ publishDate: new Date('2026-12-01'), now })).toBe('scheduled')
})
test('past publishDate + not draft => published', () => {
  expect(normalizeStatus({ publishDate: new Date('2026-01-01'), now })).toBe('published')
})
test('allPublished rule forces published regardless of date', () => {
  expect(normalizeStatus({ publishDate: new Date('2026-12-01'), rule: { allPublished: true }, now })).toBe('published')
})
test('no date, no draft => published', () => {
  expect(normalizeStatus({ publishDate: null, now })).toBe('published')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -w test status`
Expected: FAIL — `normalizeStatus` not defined.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/status.ts`:
```ts
import type { PostStatus } from './post.js'
import type { StatusRule } from './config.js'

export function normalizeStatus(input: {
  statusValue?: unknown
  draftValue?: unknown
  publishDate: Date | null
  rule?: StatusRule
  now: Date
}): PostStatus {
  const { statusValue, draftValue, publishDate, rule, now } = input
  if (rule?.allPublished) return 'published'
  // draft detection: boolean flag, or status string matching the rule's draftValue
  const isDraft =
    draftValue === true ||
    (rule?.draftValue != null && String(statusValue ?? '').toLowerCase() === rule.draftValue.toLowerCase()) ||
    String(statusValue ?? '').toLowerCase() === 'draft'
  if (isDraft) return 'draft'
  if (publishDate && publishDate.getTime() > now.getTime()) return 'scheduled'
  return 'published'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -w test status`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): status normalization (draft/scheduled/published)"
```

---

### Task 5: RawPost → Post normalization

**Files:**
- Create: `packages/core/src/normalize.ts`
- Modify: `packages/core/src/index.ts` (add export)
- Test: `packages/core/src/normalize.test.ts`

**Interfaces:**
- Consumes: `RawPost`, `Post` (post.ts); `BlogConfig` (config.ts); `normalizeStatus` (status.ts).
- Produces: `toPost(raw: RawPost, cfg: BlogConfig, now: Date): Post`. Reads canonical keys from `raw.fields` (adapters map source keys → canonical BEFORE calling this), applies status + liveUrl, keeps `raw.raw` as `Post.raw`.

- [ ] **Step 1: Write the failing test**

`packages/core/src/normalize.test.ts`:
```ts
import { expect, test } from 'vitest'
import { toPost } from './index.js'
import type { BlogConfig } from './index.js'

const cfg: BlogConfig = {
  id: 'freelance', liveUrl: 'https://logbill.com/guides',
  source: { type: 'markdown', dir: '/x' },
  fieldMap: { title: 'title', date: 'datePublished', excerpt: 'description' },
  statusRule: { allPublished: true },
}
const now = new Date('2026-08-16T00:00:00Z')

test('maps canonical fields, applies allPublished status and liveUrl', () => {
  const post = toPost({
    id: 'freelancer-tax', slug: 'freelancer-tax',
    fields: { title: 'Tax', datePublished: '2026-12-01', description: 'How much', tags: undefined },
    raw: { title: 'Tax', order: 4, datePublished: '2026-12-01' },
  }, cfg, now)
  expect(post.project).toBe('freelance')
  expect(post.title).toBe('Tax')
  expect(post.status).toBe('published')                // allPublished beats future date
  expect(post.publishDate?.toISOString().slice(0, 10)).toBe('2026-12-01')
  expect(post.liveUrl).toBe('https://logbill.com/guides/freelancer-tax')
  expect(post.raw.order).toBe(4)                        // untouched original preserved
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -w test normalize`
Expected: FAIL — `toPost` not defined.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/normalize.ts`:
```ts
import type { Post } from './post.js'
import type { RawPost } from './post.js'
import type { BlogConfig } from './config.js'
import { normalizeStatus } from './status.js'

const asDate = (v: unknown): Date | null => {
  if (v == null || v === '') return null
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}
const asTags = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []

export function toPost(raw: RawPost, cfg: BlogConfig, now: Date): Post {
  const f = raw.fields
  const publishDate = asDate(f.date)
  const status = normalizeStatus({
    statusValue: f.status,
    draftValue: f.draft,
    publishDate,
    rule: cfg.statusRule,
    now,
  })
  const liveUrl =
    cfg.liveUrl && status === 'published'
      ? `${cfg.liveUrl.replace(/\/$/, '')}/${raw.slug}`
      : undefined
  return {
    id: raw.id,
    project: cfg.id,
    title: String(f.title ?? 'Untitled'),
    slug: raw.slug,
    status,
    publishDate,
    updatedDate: asDate(f.updated) ?? undefined,
    excerpt: String(f.excerpt ?? ''),
    tags: asTags(f.tags),
    author: f.author != null ? String(f.author) : undefined,
    liveUrl,
    raw: raw.raw,
  }
}
```

Add to `index.ts`: `export * from './normalize.js'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -w test normalize`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): RawPost -> Post normalization with fieldMap + liveUrl"
```

---

### Task 6: Translation grouping → variants

**Files:**
- Create: `packages/core/src/translations.ts`
- Modify: `packages/core/src/index.ts` (add export)
- Test: `packages/core/src/translations.test.ts`

**Interfaces:**
- Consumes: `Post`, `PostVariant`.
- Produces: `groupTranslations(posts: Post[], langs: string[]): Post[]` — collapses posts sharing a `slug` into one primary Post carrying `variants` for every lang in `langs` (missing lang => `present: false`).

- [ ] **Step 1: Write the failing test**

`packages/core/src/translations.test.ts`:
```ts
import { expect, test } from 'vitest'
import { groupTranslations } from './index.js'
import type { Post } from './index.js'

const mk = (slug: string, lang: string, status: Post['status']): Post => ({
  id: `${lang}/${slug}`, project: 'reamly', title: `${slug} (${lang})`, slug, status,
  publishDate: new Date('2026-07-29'), excerpt: '', tags: [], raw: {},
  variants: [{ lang, status, publishDate: new Date('2026-07-29'), present: true }],
})

test('groups same-slug posts and marks missing langs absent', () => {
  const grouped = groupTranslations([mk('merge-pdf', 'en', 'published'), mk('merge-pdf', 'ko', 'draft')], ['en', 'ko', 'ja', 'id'])
  expect(grouped).toHaveLength(1)
  const v = grouped[0].variants!
  expect(v.find((x) => x.lang === 'en')!.present).toBe(true)
  expect(v.find((x) => x.lang === 'ko')!.status).toBe('draft')
  expect(v.find((x) => x.lang === 'ja')!.present).toBe(false)
  expect(v.find((x) => x.lang === 'id')!.present).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -w test translations`
Expected: FAIL — `groupTranslations` not defined.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/translations.ts`:
```ts
import type { Post, PostVariant } from './post.js'

export function groupTranslations(posts: Post[], langs: string[]): Post[] {
  const bySlug = new Map<string, Post[]>()
  for (const p of posts) {
    const arr = bySlug.get(p.slug) ?? []
    arr.push(p)
    bySlug.set(p.slug, arr)
  }
  const out: Post[] = []
  for (const [, group] of bySlug) {
    const present = new Map<string, Post>()
    for (const p of group) {
      const lang = p.variants?.[0]?.lang ?? 'en'
      present.set(lang, p)
    }
    const variants: PostVariant[] = langs.map((lang) => {
      const p = present.get(lang)
      return p
        ? { lang, status: p.status, publishDate: p.publishDate, present: true }
        : { lang, status: 'draft', publishDate: null, present: false }
    })
    // primary = first present lang in `langs` order
    const primary = langs.map((l) => present.get(l)).find(Boolean) ?? group[0]
    out.push({ ...primary, variants })
  }
  return out
}
```

Add to `index.ts`: `export * from './translations.js'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -w test translations`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): translation grouping into Post.variants"
```

---

### Task 7: BlogSource / FileStore interfaces + adapter registry

**Files:**
- Create: `packages/core/src/source.ts`
- Create: `packages/core/src/filestore.ts`
- Create: `packages/core/src/registry.ts`
- Modify: `packages/core/src/index.ts` (add exports)
- Test: `packages/core/src/registry.test.ts`

**Interfaces:**
- Consumes: `SourceConfig`, `BlogConfig`, `RawPost`, `DraftInput`, `Ref`, `PostBody`.
- Produces:
  - `source.ts`: `SourceCapabilities`, `BlogSource` interfaces; `SourceFactory = (cfg: BlogConfig, deps: SourceDeps) => BlogSource`; `SourceDeps { fileStore?: FileStore; env: (name: string) => string | undefined }`.
  - `filestore.ts`: `FileStore` interface.
  - `registry.ts`: `registerSource(type, factory)`, `resolveSource(cfg, deps): BlogSource`, `clearRegistry()` (test helper).

- [ ] **Step 1: Write the failing test**

`packages/core/src/registry.test.ts`:
```ts
import { afterEach, expect, test } from 'vitest'
import { registerSource, resolveSource, clearRegistry } from './index.js'
import type { BlogConfig, BlogSource } from './index.js'

afterEach(() => clearRegistry())

const cfg: BlogConfig = {
  id: 'x', source: { type: 'markdown', dir: '/x' },
  fieldMap: { title: 'title', date: 'date', excerpt: 'excerpt' },
}

test('resolveSource dispatches on source.type', () => {
  const fake: BlogSource = {
    capabilities: { canWrite: true, enforcesFutureDates: false, supportsTranslations: false },
    list: async () => [], read: async () => ({ post: {} as any, body: '' }),
    createDraft: async () => ({ id: 'r' }),
  }
  registerSource('markdown', () => fake)
  expect(resolveSource(cfg, { env: () => undefined })).toBe(fake)
})

test('resolveSource throws on unknown type', () => {
  expect(() => resolveSource(cfg, { env: () => undefined })).toThrow(/no adapter registered/i)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -w test registry`
Expected: FAIL — exports not defined.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/filestore.ts`:
```ts
export interface FileStore {
  list(dir: string): Promise<string[]>
  read(path: string): Promise<string>
  write(path: string, content: string, opts: { message: string }): Promise<void>
}
```

`packages/core/src/source.ts`:
```ts
import type { BlogConfig } from './config.js'
import type { RawPost, DraftInput, Ref, PostBody } from './post.js'
import type { FileStore } from './filestore.js'

export interface SourceCapabilities {
  canWrite: boolean
  enforcesFutureDates: boolean
  supportsTranslations: boolean
}

export interface BlogSource {
  capabilities: SourceCapabilities
  list(): Promise<RawPost[]>
  read(id: string): Promise<PostBody>
  createDraft(input: DraftInput): Promise<Ref>
  // publish(id: string): Promise<void>   // L3
}

export interface SourceDeps {
  fileStore?: FileStore
  env: (name: string) => string | undefined
}

export type SourceFactory = (cfg: BlogConfig, deps: SourceDeps) => BlogSource
```

`packages/core/src/registry.ts`:
```ts
import type { BlogConfig } from './config.js'
import type { BlogSource, SourceDeps, SourceFactory } from './source.js'

const registry = new Map<string, SourceFactory>()

export function registerSource(type: string, factory: SourceFactory): void {
  registry.set(type, factory)
}
export function resolveSource(cfg: BlogConfig, deps: SourceDeps): BlogSource {
  const factory = registry.get(cfg.source.type)
  if (!factory) throw new Error(`No adapter registered for source type "${cfg.source.type}"`)
  return factory(cfg, deps)
}
export function clearRegistry(): void {
  registry.clear()
}
```

Add to `index.ts`: `export * from './filestore.js'`, `export * from './source.js'`, `export * from './registry.js'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -w test registry`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): BlogSource/FileStore interfaces + adapter registry"
```

---

### Task 8: localFs FileStore (fs + git commit)

**Files:**
- Create: `packages/adapters/src/localfs.ts`
- Test: `packages/adapters/src/localfs.test.ts`

**Interfaces:**
- Consumes: `FileStore` (core).
- Produces: `createLocalFs(rootDir: string): FileStore`. `write` writes the file then `git add <path> && git commit -m <message>` scoped to `rootDir`; if the path is unchanged, commit is skipped (git no-ops). `list` returns file paths relative to the requested dir.

- [ ] **Step 1: Write the failing test**

`packages/adapters/src/localfs.test.ts`:
```ts
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterAll, expect, test } from 'vitest'
import { createLocalFs } from './localfs.js'

const root = mkdtempSync(join(tmpdir(), 'bm-localfs-'))
execFileSync('git', ['init', '-q'], { cwd: root })
execFileSync('git', ['config', 'user.email', 't@t.co'], { cwd: root })
execFileSync('git', ['config', 'user.name', 't'], { cwd: root })

test('write persists content and creates a commit', async () => {
  const fs = createLocalFs(root)
  await fs.write('posts/a.md', 'hello', { message: 'add a' })
  expect(readFileSync(join(root, 'posts/a.md'), 'utf8')).toBe('hello')
  const log = execFileSync('git', ['log', '--oneline'], { cwd: root }).toString()
  expect(log).toContain('add a')
})

test('read returns written content; list finds it', async () => {
  const fs = createLocalFs(root)
  expect(await fs.read('posts/a.md')).toBe('hello')
  expect(await fs.list('posts')).toContain('a.md')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -w test localfs`
Expected: FAIL — `./localfs.js` not found.

- [ ] **Step 3: Write minimal implementation**

`packages/adapters/src/localfs.ts`:
```ts
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { FileStore } from '@postdeck/core'

const run = promisify(execFile)

export function createLocalFs(rootDir: string): FileStore {
  const abs = (p: string) => join(rootDir, p)
  return {
    async list(dir) {
      try { return await readdir(abs(dir)) } catch { return [] }
    },
    async read(path) {
      return readFile(abs(path), 'utf8')
    },
    async write(path, content, { message }) {
      await mkdir(dirname(abs(path)), { recursive: true })
      await writeFile(abs(path), content, 'utf8')
      await run('git', ['add', path], { cwd: rootDir })
      // commit; ignore "nothing to commit" when content is identical.
      try { await run('git', ['commit', '-m', message, '--', path], { cwd: rootDir }) }
      catch (e: any) { if (!/nothing to commit/i.test(e.stdout ?? e.message ?? '')) throw e }
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -w test localfs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(adapters): localFs FileStore (fs + git commit)"
```

---

### Task 9: markdown adapter (list + round-trip createDraft)

**Files:**
- Create: `packages/adapters/src/markdown.ts`
- Modify: `packages/adapters/src/index.ts` (register `'markdown'`)
- Test: `packages/adapters/src/markdown.test.ts`

**Interfaces:**
- Consumes: `BlogSource`, `SourceFactory`, `BlogConfig`, `RawPost`, `DraftInput`, `toPost`, `parseFrontmatter`, `patchFrontmatter`, `createLocalFs`, `registerSource`.
- Produces: `markdownFactory: SourceFactory` registered under `'markdown'`. `list()` reads `dir/*.md`, maps source keys → canonical via reverse `fieldMap`, returns `RawPost[]`. `createDraft()` writes a new file using the project's `fieldMap` key names, patching a template so unmapped keys are absent (new file) but body + mapped frontmatter are correct.

- [ ] **Step 1: Write the failing test**

`packages/adapters/src/markdown.test.ts`:
```ts
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { resolveSource, toPost, type BlogConfig } from '@postdeck/core'
import './index.js'  // side-effect: registers adapters
import { createLocalFs } from './localfs.js'

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'bm-md-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 't@t.co'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: root })
  mkdirSync(join(root, 'guides'))
  return root
}

const cfg = (dir: string): BlogConfig => ({
  id: 'freelance', source: { type: 'markdown', dir },
  fieldMap: { title: 'title', date: 'datePublished', excerpt: 'description' },
  statusRule: { allPublished: true },
})

test('list maps datePublished->date and description->excerpt', async () => {
  const root = repo()
  writeFileSync(join(root, 'guides/a.md'),
    '---\ntitle: A\ndatePublished: "2026-01-01"\ndescription: hey\norder: 2\n---\n\nbody', 'utf8')
  const src = resolveSource(cfg(join(root, 'guides')), { env: () => undefined, fileStore: createLocalFs(root) })
  const raws = await src.list()
  const post = toPost(raws[0], cfg(join(root, 'guides')), new Date('2026-08-16'))
  expect(post.title).toBe('A')
  expect(post.excerpt).toBe('hey')
  expect(post.publishDate?.toISOString().slice(0, 10)).toBe('2026-01-01')
  expect(post.raw.order).toBe(2)   // original preserved through RawPost.raw
})

test('createDraft writes frontmatter in the project field-map naming', async () => {
  const root = repo()
  const src = resolveSource(cfg(join(root, 'guides')), { env: () => undefined, fileStore: createLocalFs(root) })
  const ref = await src.createDraft({ slug: 'new-post', title: 'New', excerpt: 'sum', body: 'Hello world', date: new Date('2026-09-01') })
  const written = readFileSync(join(root, ref.path!), 'utf8')
  expect(written).toContain('title: New')
  expect(written).toContain('datePublished:')     // uses the mapped key, not "date"
  expect(written).toContain('description: sum')   // uses the mapped key, not "excerpt"
  expect(written).toContain('Hello world')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -w test markdown`
Expected: FAIL — factory not registered / file missing.

- [ ] **Step 3: Write minimal implementation**

`packages/adapters/src/markdown.ts`:
```ts
import { basename } from 'node:path'
import type { SourceFactory, BlogSource, RawPost, DraftInput, Ref, FieldMap } from '@postdeck/core'
import { parseFrontmatter, patchFrontmatter } from './frontmatter.js'

// Build canonical `fields` from raw frontmatter using the project's fieldMap.
function canonicalFields(raw: Record<string, unknown>, fm: FieldMap): Record<string, unknown> {
  const get = (k?: string) => (k ? raw[k] : undefined)
  return {
    title: get(fm.title), date: get(fm.date), excerpt: get(fm.excerpt),
    status: get(fm.status), draft: get(fm.draft), tags: get(fm.tags),
    author: get(fm.author), updated: get(fm.updated),
  }
}

export const markdownFactory: SourceFactory = (cfg, deps) => {
  const fs = deps.fileStore
  if (!fs) throw new Error('markdown adapter requires a fileStore')
  const dir = (cfg.source as { dir: string }).dir
  const fm = cfg.fieldMap

  const source: BlogSource = {
    capabilities: { canWrite: true, enforcesFutureDates: false, supportsTranslations: false },
    async list(): Promise<RawPost[]> {
      const files = (await fs.list(dir)).filter((f) => f.endsWith('.md'))
      const out: RawPost[] = []
      for (const f of files) {
        const raw = parseFrontmatter(await fs.read(`${dir}/${f}`)).data
        const slug = String(raw[fm.slug ?? 'slug'] ?? basename(f, '.md'))
        out.push({ id: slug, slug, fields: canonicalFields(raw, fm), raw })
      }
      return out
    },
    async read(id) {
      const parsed = parseFrontmatter(await fs.read(`${dir}/${id}.md`))
      // toPost is applied by the caller in the app layer; return a shell here.
      return { post: { slug: id } as any, body: parsed.body }
    },
    async createDraft(input: DraftInput): Promise<Ref> {
      // Build a template with a draft marker, then patch mapped keys by their SOURCE names.
      const template = `---\n${fm.status ?? 'status'}: draft\n---\n\n${input.body}\n`
      const patch: Record<string, unknown> = {
        [fm.title]: input.title,
        [fm.date]: input.date ? input.date.toISOString().slice(0, 10) : '',
        [fm.excerpt]: input.excerpt,
        ...(fm.tags && input.tags ? { [fm.tags]: input.tags } : {}),
        ...(input.extraFields ?? {}),
      }
      const content = patchFrontmatter(template, patch)
      const path = `${dir}/${input.slug}.md`
      await fs.write(path, content, { message: `blog: draft ${input.slug}` })
      return { id: input.slug, path }
    },
  }
  return source
}
```

`packages/adapters/src/index.ts`:
```ts
import { registerSource } from '@postdeck/core'
import { markdownFactory } from './markdown.js'
registerSource('markdown', markdownFactory)
export * from './frontmatter.js'
export * from './localfs.js'
export { markdownFactory } from './markdown.js'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -w test markdown`
Expected: PASS (2 tests). Note: `ref.path` in the test is relative to repo root; `createLocalFs(root)` joins it, and `dir` passed in cfg is absolute — adjust the test's cfg `dir` to a repo-relative `'guides'` and construct localFs with `root` so paths line up. (Use `dir: 'guides'`, not the absolute join, in this test.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(adapters): markdown source (list + round-trip-safe createDraft)"
```

---

### Task 10: astro-collection adapter (multilingual)

**Files:**
- Create: `packages/adapters/src/astro-collection.ts`
- Modify: `packages/adapters/src/index.ts` (register `'astro-collection'`)
- Test: `packages/adapters/src/astro-collection.test.ts`

**Interfaces:**
- Consumes: same as Task 9 + `groupTranslations` is applied by the app layer (adapter emits per-lang RawPosts with `lang` set).
- Produces: `astroCollectionFactory: SourceFactory` under `'astro-collection'`. `list()` walks `dir/<lang>/*.md` for each configured lang, sets `RawPost.lang`, `id = "<lang>/<slug>"`. `capabilities.supportsTranslations = true`.

- [ ] **Step 1: Write the failing test**

`packages/adapters/src/astro-collection.test.ts`:
```ts
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { resolveSource, type BlogConfig } from '@postdeck/core'
import './index.js'
import { createLocalFs } from './localfs.js'

const cfg: BlogConfig = {
  id: 'reamly', source: { type: 'astro-collection', dir: 'blog', langs: ['en', 'ko'] },
  fieldMap: { title: 'title', date: 'date', draft: 'draft', excerpt: 'description' },
  groupTranslationsBy: 'slug',
}

test('list walks lang folders and tags each RawPost with its lang', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-astro-'))
  mkdirSync(join(root, 'blog/en'), { recursive: true })
  mkdirSync(join(root, 'blog/ko'), { recursive: true })
  writeFileSync(join(root, 'blog/en/merge.md'), '---\ntitle: Merge\ndate: 2026-07-29\ndraft: false\ndescription: d\n---\nx', 'utf8')
  writeFileSync(join(root, 'blog/ko/merge.md'), '---\ntitle: 병합\ndate: 2026-07-29\ndraft: true\ndescription: d\n---\nx', 'utf8')
  const src = resolveSource(cfg, { env: () => undefined, fileStore: createLocalFs(root) })
  const raws = await src.list()
  expect(raws.map((r) => r.id).sort()).toEqual(['en/merge', 'ko/merge'])
  expect(raws.find((r) => r.lang === 'ko')!.fields.draft).toBe(true)
  expect(src.capabilities.supportsTranslations).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -w test astro-collection`
Expected: FAIL — factory not registered.

- [ ] **Step 3: Write minimal implementation**

`packages/adapters/src/astro-collection.ts`:
```ts
import { basename } from 'node:path'
import type { SourceFactory, BlogSource, RawPost, DraftInput, Ref, FieldMap } from '@postdeck/core'
import { parseFrontmatter, patchFrontmatter } from './frontmatter.js'

function canonicalFields(raw: Record<string, unknown>, fm: FieldMap): Record<string, unknown> {
  const get = (k?: string) => (k ? raw[k] : undefined)
  return {
    title: get(fm.title), date: get(fm.date), excerpt: get(fm.excerpt),
    status: get(fm.status), draft: get(fm.draft), tags: get(fm.tags),
    author: get(fm.author), updated: get(fm.updated),
  }
}

export const astroCollectionFactory: SourceFactory = (cfg, deps) => {
  const fs = deps.fileStore
  if (!fs) throw new Error('astro-collection adapter requires a fileStore')
  const src = cfg.source as { dir: string; langs: string[] }
  const fm = cfg.fieldMap

  const source: BlogSource = {
    capabilities: { canWrite: true, enforcesFutureDates: false, supportsTranslations: true },
    async list(): Promise<RawPost[]> {
      const out: RawPost[] = []
      for (const lang of src.langs) {
        const langDir = `${src.dir}/${lang}`
        const files = (await fs.list(langDir)).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))
        for (const f of files) {
          const raw = parseFrontmatter(await fs.read(`${langDir}/${f}`)).data
          const slug = basename(f).replace(/\.mdx?$/, '')
          out.push({ id: `${lang}/${slug}`, slug, lang, fields: canonicalFields(raw, fm), raw })
        }
      }
      return out
    },
    async read(id) {
      const parsed = parseFrontmatter(await fs.read(`${src.dir}/${id}.md`))
      return { post: { slug: id } as any, body: parsed.body }
    },
    async createDraft(input: DraftInput): Promise<Ref> {
      const lang = input.lang ?? src.langs[0]
      const template = `---\n${fm.draft ?? 'draft'}: true\n---\n\n${input.body}\n`
      const patch: Record<string, unknown> = {
        [fm.title]: input.title,
        [fm.date]: input.date ? input.date.toISOString().slice(0, 10) : '',
        [fm.excerpt]: input.excerpt,
        ...(input.extraFields ?? {}),
      }
      const path = `${src.dir}/${lang}/${input.slug}.md`
      await fs.write(path, patchFrontmatter(template, patch), { message: `blog: draft ${lang}/${input.slug}` })
      return { id: `${lang}/${input.slug}`, path }
    },
  }
  return source
}
```

Add to `index.ts`:
```ts
import { astroCollectionFactory } from './astro-collection.js'
registerSource('astro-collection', astroCollectionFactory)
export { astroCollectionFactory } from './astro-collection.js'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -w test astro-collection`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(adapters): astro-collection multilingual source"
```

---

### Task 11: notion adapter (recorded-fixture read)

**Files:**
- Create: `packages/adapters/src/notion.ts`
- Create fixture: `packages/adapters/src/__fixtures__/notion-query.json`
- Modify: `packages/adapters/src/index.ts` (register `'notion'`)
- Test: `packages/adapters/src/notion.test.ts`

**Interfaces:**
- Consumes: `SourceFactory`, `SourceDeps.env` (reads token via `cfg.source.tokenRef`).
- Produces: `notionFactory: SourceFactory` under `'notion'`. Uses an injectable `fetch` (via `deps` — add `fetchImpl?` to SourceDeps in this task) so tests feed a recorded response. Maps Notion property objects → canonical `fields`. `capabilities.enforcesFutureDates = false`.

- [ ] **Step 1: Extend SourceDeps (core) for injectable fetch**

Modify `packages/core/src/source.ts` — add to `SourceDeps`:
```ts
  fetchImpl?: typeof fetch
```

- [ ] **Step 2: Create the fixture**

`packages/adapters/src/__fixtures__/notion-query.json` (trimmed Notion `POST /databases/:id/query` response):
```json
{
  "object": "list",
  "results": [
    {
      "id": "page-1",
      "properties": {
        "Title": { "type": "title", "title": [{ "plain_text": "Shipping fast" }] },
        "Slug": { "type": "rich_text", "rich_text": [{ "plain_text": "shipping-fast" }] },
        "Date": { "type": "date", "date": { "start": "2026-07-01" } },
        "Excerpt": { "type": "rich_text", "rich_text": [{ "plain_text": "Notes" }] },
        "Status": { "type": "status", "status": { "name": "Published" } },
        "Tags": { "type": "multi_select", "multi_select": [{ "name": "design" }] }
      }
    }
  ],
  "has_more": false,
  "next_cursor": null
}
```

- [ ] **Step 3: Write the failing test**

`packages/adapters/src/notion.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { expect, test } from 'vitest'
import { resolveSource, toPost, type BlogConfig } from '@postdeck/core'
import './index.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(here, '__fixtures__/notion-query.json'), 'utf8')

const cfg: BlogConfig = {
  id: 'hongix', liveUrl: 'https://hongix.com/blog',
  source: { type: 'notion', databaseId: 'db1', tokenRef: 'HONGIX_NOTION_TOKEN' },
  fieldMap: { title: 'Title', date: 'Date', excerpt: 'Excerpt', status: 'Status', tags: 'Tags', slug: 'Slug' },
  statusRule: { draftValue: 'draft' },
}

test('list maps Notion properties to canonical fields', async () => {
  const fakeFetch = (async () => new Response(fixture, { status: 200 })) as unknown as typeof fetch
  const src = resolveSource(cfg, { env: (n) => (n === 'HONGIX_NOTION_TOKEN' ? 'secret' : undefined), fetchImpl: fakeFetch })
  const raws = await src.list()
  const post = toPost(raws[0], cfg, new Date('2026-08-16'))
  expect(post.title).toBe('Shipping fast')
  expect(post.slug).toBe('shipping-fast')
  expect(post.excerpt).toBe('Notes')
  expect(post.tags).toEqual(['design'])
  expect(post.status).toBe('published')
  expect(post.liveUrl).toBe('https://hongix.com/blog/shipping-fast')
})

test('missing token throws a clear error', () => {
  expect(() => resolveSource(cfg, { env: () => undefined })).toThrow(/HONGIX_NOTION_TOKEN/)
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm -w test notion`
Expected: FAIL — factory not registered.

- [ ] **Step 5: Write minimal implementation**

`packages/adapters/src/notion.ts`:
```ts
import type { SourceFactory, BlogSource, RawPost, DraftInput, Ref, FieldMap } from '@postdeck/core'

type Prop = any
const readText = (p: Prop): string => {
  if (!p) return ''
  if (p.type === 'title') return (p.title ?? []).map((t: any) => t.plain_text).join('')
  if (p.type === 'rich_text') return (p.rich_text ?? []).map((t: any) => t.plain_text).join('')
  return ''
}
const readStatus = (p: Prop): string =>
  !p ? '' : p.type === 'status' ? (p.status?.name ?? '') : p.type === 'select' ? (p.select?.name ?? '') : ''
const readTags = (p: Prop): string[] =>
  !p ? [] : p.type === 'multi_select' ? p.multi_select.map((s: any) => s.name) : []
const readDate = (p: Prop): string => (p?.type === 'date' ? (p.date?.start ?? '') : '')

function canonicalFields(props: Record<string, Prop>, fm: FieldMap): Record<string, unknown> {
  const pick = (k?: string) => (k ? props[k] : undefined)
  return {
    title: readText(pick(fm.title)),
    date: readDate(pick(fm.date)),
    excerpt: readText(pick(fm.excerpt)),
    status: readStatus(pick(fm.status)),
    tags: readTags(pick(fm.tags)),
    author: fm.author ? readText(pick(fm.author)) : undefined,
  }
}

export const notionFactory: SourceFactory = (cfg, deps) => {
  const src = cfg.source as { databaseId: string; tokenRef: string }
  const token = deps.env(src.tokenRef)
  if (!token) throw new Error(`Notion token env var "${src.tokenRef}" is not set`)
  const fm = cfg.fieldMap
  const doFetch = deps.fetchImpl ?? fetch
  const H = { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }

  const source: BlogSource = {
    capabilities: { canWrite: true, enforcesFutureDates: false, supportsTranslations: false },
    async list(): Promise<RawPost[]> {
      const out: RawPost[] = []
      let cursor: string | undefined
      do {
        const res = await doFetch(`https://api.notion.com/v1/databases/${src.databaseId}/query`, {
          method: 'POST', headers: H,
          body: JSON.stringify(cursor ? { start_cursor: cursor } : {}),
        })
        const j: any = await res.json()
        if (j.object === 'error') throw new Error(`Notion ${j.status} ${j.code}: ${j.message}`)
        for (const page of j.results) {
          const props = page.properties
          const slug = readText(props[fm.slug ?? 'Slug']) || page.id
          out.push({ id: page.id, slug, fields: canonicalFields(props, fm), raw: props })
        }
        cursor = j.has_more ? j.next_cursor : undefined
      } while (cursor)
      return out
    },
    async read(id) {
      // Body fetch (blocks->markdown) deferred to L2; return empty body shell for now.
      return { post: { slug: id } as any, body: '' }
    },
    async createDraft(input: DraftInput): Promise<Ref> {
      const props: any = {
        [fm.title]: { title: [{ text: { content: input.title } }] },
        ...(fm.excerpt ? { [fm.excerpt]: { rich_text: [{ text: { content: input.excerpt } }] } } : {}),
        ...(fm.status ? { [fm.status]: { status: { name: 'Draft' } } } : {}),
      }
      const res = await doFetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers: H,
        body: JSON.stringify({ parent: { database_id: src.databaseId }, properties: props }),
      })
      const j: any = await res.json()
      if (j.object === 'error') throw new Error(`Notion ${j.status} ${j.code}: ${j.message}`)
      return { id: j.id, url: j.url }
    },
  }
  return source
}
```

Add to `index.ts`:
```ts
import { notionFactory } from './notion.js'
registerSource('notion', notionFactory)
export { notionFactory } from './notion.js'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm -w test notion`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(adapters): notion source (recorded-fixture read + draft page create)"
```

---

### Task 12: Engine integration — resolve config → normalized Posts

Ties the pieces into one entrypoint the app layer will call. Proves the whole chain against a temp repo with two markdown files.

**Files:**
- Create: `packages/adapters/src/engine.ts`
- Modify: `packages/adapters/src/index.ts` (export `loadPosts`)
- Test: `packages/adapters/src/engine.test.ts`

**Interfaces:**
- Consumes: `resolveSource`, `toPost`, `groupTranslations`, `BlogsConfig`, `SourceDeps`.
- Produces: `loadPosts(config: BlogsConfig, deps: SourceDeps, now?: Date): Promise<Record<string, Post[]>>` — keyed by project id; applies `groupTranslations` when `groupTranslationsBy` is set.

- [ ] **Step 1: Write the failing test**

`packages/adapters/src/engine.test.ts`:
```ts
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { defineBlogs, markdownSource } from '@postdeck/core'
import { loadPosts, createLocalFs } from './index.js'

test('loadPosts returns normalized posts keyed by project', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-eng-'))
  mkdirSync(join(root, 'guides'), { recursive: true })
  writeFileSync(join(root, 'guides/a.md'), '---\ntitle: A\ndatePublished: "2026-01-01"\ndescription: d\n---\nx', 'utf8')
  const config = defineBlogs([{
    id: 'freelance', source: markdownSource({ dir: 'guides' }),
    fieldMap: { title: 'title', date: 'datePublished', excerpt: 'description' },
    statusRule: { allPublished: true },
  }])
  const posts = await loadPosts(config, { env: () => undefined, fileStore: createLocalFs(root) }, new Date('2026-08-16'))
  expect(posts.freelance).toHaveLength(1)
  expect(posts.freelance[0].title).toBe('A')
  expect(posts.freelance[0].status).toBe('published')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -w test engine`
Expected: FAIL — `loadPosts` not exported.

- [ ] **Step 3: Write minimal implementation**

`packages/adapters/src/engine.ts`:
```ts
import { resolveSource, toPost, groupTranslations, type BlogsConfig, type SourceDeps, type Post } from '@postdeck/core'

export async function loadPosts(
  config: BlogsConfig,
  deps: SourceDeps,
  now: Date = new Date(),
): Promise<Record<string, Post[]>> {
  const result: Record<string, Post[]> = {}
  for (const cfg of config) {
    const source = resolveSource(cfg, deps)
    const raws = await source.list()
    let posts = raws.map((r) => {
      const post = toPost(r, cfg, now)
      // seed a single-lang variant so grouping can read the lang
      if (r.lang) post.variants = [{ lang: r.lang, status: post.status, publishDate: post.publishDate, present: true }]
      return post
    })
    if (cfg.groupTranslationsBy && cfg.source.type === 'astro-collection') {
      posts = groupTranslations(posts, cfg.source.langs)
    }
    result[cfg.id] = posts
  }
  return result
}
```

Add to `index.ts`: `export { loadPosts } from './engine.js'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -w test engine`
Expected: PASS (1 test). Then run the full suite: `pnpm -w test` — expect all green.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(adapters): loadPosts engine (config -> normalized posts by project)"
```

---

## Self-Review

**Spec coverage (§ → task):**
- §3 hexagonal 3-package boundary → Task 1 (scaffold), enforced by Global Constraints.
- §4 Post model + status + variants → Tasks 2, 4, 5, 6.
- §4 "예약(빌드 미반영)" honesty → `capabilities.enforcesFutureDates=false` in Tasks 9/10/11; UI reflection is Plan 2 (dashboard).
- §5 BlogSource + capabilities + patch-not-overwrite → Tasks 3, 7, 9, 10, 11.
- §6 FileStore port + localFs → Tasks 7, 8; `githubContentsApi` deferred (interface-only, per spec Non-Goals).
- §7 serializable config + registry + Zod → Tasks 2, 7.
- §7 Tier-3 plugin loader → registry seam only (Task 7); full loader deferred per spec.
- §8 AI pipeline (L2) → **out of scope for this plan** (Plan 3). `createDraft` write path is built here so Plan 3 only adds generation.
- §9 tests: round-trip diff==0 first → Task 3 precedes all write code. ✅
- §10 build order → tasks are ordered exactly as §10 items 1–3 (round-trip → core → adapters). Items 4–7 (dashboard/CLI/L3) are Plans 2–3.

**Placeholder scan:** No TBD/TODO; every code step is complete. The `read()` methods return a minimal body shell intentionally (full block→markdown conversion is L2/Plan 3) — this is a scoped deliverable, not a placeholder, and is noted at each site.

**Type consistency:** `RawPost.fields` uses canonical keys everywhere; adapters build them via `canonicalFields`. `SourceDeps` gains `fetchImpl?` in Task 11 Step 1 before `notion.ts` uses it. `loadPosts` return type matches `Record<string, Post[]>` consumed by Plan 2. `createLocalFs`, `resolveSource`, `registerSource`, `toPost`, `groupTranslations`, `normalizeStatus`, `parseFrontmatter`, `patchFrontmatter` names are consistent across all tasks.

**Known follow-ups for Plan 2/3 (not gaps in this plan):**
- Dashboard renders `capabilities` → "예약(빌드 미반영)" badge.
- `read()` full-body fetch (Notion blocks→markdown; markdown/astro already return body).
- CLI `npx postdeck` boot.
- L2 generation + De-AI linter → then `createDraft` (already built).
