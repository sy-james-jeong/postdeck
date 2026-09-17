# Notion read() (blocks → markdown) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Implement the notion adapter's `read()` (currently a stub throw) — fetch a page's properties + block children and return `{ post, body }` with the body rendered as markdown — so hongix tone context uses real bodies and a future detail view is unblocked.

**Architecture:** A pure `blocksToMarkdown(blocks)` converts Notion block objects to markdown (unit-tested with fixtures). `read()` fetches page + paginated block children via the injectable `doFetch`, converts, and builds a `Post` via core's `toPost` — fully testable with a fake `fetchImpl`.

**Tech Stack:** TypeScript (NodeNext, strict, verbatimModuleSyntax), Vitest.

## Global Constraints
- `@postdeck/core` stays pure; no new deps. `.js` import extensions. Tests colocated. Additive: all 82 tests stay green.
- Only the notion adapter's `read()` changes; `list`/`createDraft` untouched. markdown/astro adapters untouched.
- No network in tests — use recorded JSON via `deps.fetchImpl`.

---

## File Structure
- Create: `packages/adapters/src/notion-blocks.ts` (+ `notion-blocks.test.ts`)
- Modify: `packages/adapters/src/notion.ts` (imports + `read()`), `packages/adapters/src/index.ts` (export `blocksToMarkdown`), `packages/adapters/src/notion.test.ts` (append read() test)

---

## Task 1: `blocksToMarkdown` (pure)

**Files:** Create `packages/adapters/src/notion-blocks.ts`, `packages/adapters/src/notion-blocks.test.ts`; modify `packages/adapters/src/index.ts`.

**Interfaces:**
- Produces: `blocksToMarkdown(blocks: unknown[]): string`

- [ ] **Step 1: Write the failing test** (`packages/adapters/src/notion-blocks.test.ts`)

```ts
import { expect, test } from 'vitest'
import { blocksToMarkdown } from './index.js'

const rt = (s: string) => ({ rich_text: [{ plain_text: s }] })

test('blocksToMarkdown renders common block types', () => {
  const blocks = [
    { type: 'heading_1', heading_1: rt('Title') },
    { type: 'paragraph', paragraph: rt('A paragraph.') },
    { type: 'heading_2', heading_2: rt('Sub') },
    { type: 'bulleted_list_item', bulleted_list_item: rt('one') },
    { type: 'numbered_list_item', numbered_list_item: rt('first') },
    { type: 'to_do', to_do: { rich_text: [{ plain_text: 'done' }], checked: true } },
    { type: 'quote', quote: rt('wise') },
    { type: 'code', code: { rich_text: [{ plain_text: 'const x = 1' }], language: 'js' } },
    { type: 'divider', divider: {} },
  ]
  const md = blocksToMarkdown(blocks)
  expect(md).toContain('# Title')
  expect(md).toContain('A paragraph.')
  expect(md).toContain('## Sub')
  expect(md).toContain('- one')
  expect(md).toContain('1. first')
  expect(md).toContain('- [x] done')
  expect(md).toContain('> wise')
  expect(md).toContain('```js\nconst x = 1\n```')
  expect(md).toContain('---')
})

test('blocksToMarkdown skips unknown types with no text and returns "" for empty', () => {
  expect(blocksToMarkdown([])).toBe('')
  expect(blocksToMarkdown([{ type: 'unsupported_widget', unsupported_widget: {} }])).toBe('')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/adapters/src/notion-blocks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/adapters/src/notion-blocks.ts`**

```ts
// Pure Notion-block → markdown converter (top-level blocks only; no nested children,
// no inline annotations — sufficient for tone snippets and a basic body view).
const rt = (data: any): string => (data?.rich_text ?? []).map((t: any) => t?.plain_text ?? '').join('')

export function blocksToMarkdown(blocks: unknown[]): string {
  const lines: string[] = []
  for (const block of (blocks ?? []) as any[]) {
    const t: string | undefined = block?.type
    if (!t) continue
    const data = block[t]
    switch (t) {
      case 'paragraph': { const s = rt(data); if (s) lines.push(s); break }
      case 'heading_1': lines.push(`# ${rt(data)}`); break
      case 'heading_2': lines.push(`## ${rt(data)}`); break
      case 'heading_3': lines.push(`### ${rt(data)}`); break
      case 'bulleted_list_item': lines.push(`- ${rt(data)}`); break
      case 'numbered_list_item': lines.push(`1. ${rt(data)}`); break
      case 'to_do': lines.push(`- [${data?.checked ? 'x' : ' '}] ${rt(data)}`); break
      case 'quote': lines.push(`> ${rt(data)}`); break
      case 'code': lines.push('```' + (data?.language ?? '') + '\n' + rt(data) + '\n```'); break
      case 'divider': lines.push('---'); break
      default: { const s = rt(data); if (s) lines.push(s) }
    }
  }
  return lines.join('\n\n').trim()
}
```

- [ ] **Step 4: Export from `packages/adapters/src/index.ts`** — add:

```ts
export { blocksToMarkdown } from './notion-blocks.js'
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run packages/adapters/src/notion-blocks.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/notion-blocks.ts packages/adapters/src/notion-blocks.test.ts packages/adapters/src/index.ts
git commit -m "feat(adapters): blocksToMarkdown — Notion blocks to markdown (pure)"
```

---

## Task 2: notion `read()`

**Files:** Modify `packages/adapters/src/notion.ts`, `packages/adapters/src/notion.test.ts` (append).

**Interfaces:**
- Consumes: `toPost`, `PostBody`, `RawPost` (`@postdeck/core`), `blocksToMarkdown` (`./notion-blocks.js`), existing `readText`/`canonicalFields`/`H`/`doFetch`.
- Produces: notion `source.read(id)` returns `{ post, body }`.

- [ ] **Step 1: Add the failing test** (append to `packages/adapters/src/notion.test.ts`)

```ts
test('notion read() returns post + markdown body (paginated blocks)', async () => {
  const page = {
    object: 'page', id: 'p1',
    properties: {
      Title: { type: 'title', title: [{ plain_text: 'Hello' }] },
      Slug: { type: 'rich_text', rich_text: [{ plain_text: 'hello' }] },
    },
  }
  const page1 = { object: 'list', results: [{ type: 'heading_1', heading_1: { rich_text: [{ plain_text: 'Intro' }] } }], has_more: true, next_cursor: 'c2' }
  const page2 = { object: 'list', results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Body text.' }] } }], has_more: false }
  const fetchImpl = (async (url: string) => {
    if (!url.includes('/blocks/')) return { json: async () => page } as any
    return { json: async () => (url.includes('start_cursor=c2') ? page2 : page1) } as any
  }) as unknown as typeof fetch

  const src = notionFactory(
    { id: 'h', source: { type: 'notion', databaseId: 'db', tokenRef: 'T' }, fieldMap: { title: 'Title', date: 'Date', excerpt: 'Excerpt', slug: 'Slug' } } as any,
    { env: (n) => (n === 'T' ? 'tok' : undefined), fetchImpl },
  )
  const { post, body } = await src.read('p1')
  expect(post.title).toBe('Hello')
  expect(body).toContain('# Intro')
  expect(body).toContain('Body text.')
})
```

(Ensure `notion.test.ts` imports `notionFactory` from `./notion.js` — it already does for existing tests; add if missing.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/adapters/src/notion.test.ts`
Expected: FAIL — `read()` throws `not implemented until L2`.

- [ ] **Step 3: Update imports at the top of `packages/adapters/src/notion.ts`**

Replace the first import line with:

```ts
import type { SourceFactory, BlogSource, RawPost, DraftInput, Ref, FieldMap, PostBody } from '@postdeck/core'
import { toPost } from '@postdeck/core'
import { blocksToMarkdown } from './notion-blocks.js'
```

- [ ] **Step 4: Replace the `read()` stub** in `packages/adapters/src/notion.ts`

```ts
    async read(id: string): Promise<PostBody> {
      const pageRes = await doFetch(`https://api.notion.com/v1/pages/${id}`, { headers: H })
      const page: any = await pageRes.json()
      if (page.object === 'error') throw new Error(`Notion ${page.status} ${page.code}: ${page.message}`)
      const blocks: any[] = []
      let cursor: string | undefined
      do {
        const url = `https://api.notion.com/v1/blocks/${id}/children` + (cursor ? `?start_cursor=${cursor}` : '')
        const res = await doFetch(url, { headers: H })
        const j: any = await res.json()
        if (j.object === 'error') throw new Error(`Notion ${j.status} ${j.code}: ${j.message}`)
        blocks.push(...(j.results ?? []))
        cursor = j.has_more ? j.next_cursor : undefined
      } while (cursor)
      const props = page.properties
      const slug = readText(props[fm.slug ?? 'Slug']) || page.id
      const rawPost: RawPost = { id: page.id, slug, fields: canonicalFields(props, fm), raw: props }
      return { post: toPost(rawPost, cfg, new Date()), body: blocksToMarkdown(blocks) }
    },
```

- [ ] **Step 5: Run test + full suite + typecheck**

Run: `pnpm vitest run packages/adapters/src/notion.test.ts`
Expected: PASS (existing notion tests + the new read() test).
Run: `pnpm test`
Expected: PASS — 82 prior + Task 1's 2 + this 1 = 85.
Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/notion.ts packages/adapters/src/notion.test.ts
git commit -m "feat(adapters): implement notion read() (page props + blocks->markdown)"
```

---

## Self-Review
**Spec coverage:** `blocksToMarkdown` pure + block types (§1) → Task 1. notion `read()` page+paginated-blocks→`{post,body}` via `toPost` (§1) → Task 2. Fake-fetch tests incl. pagination (§3) → Task 2. `gatherToneContext`/UI unchanged (auto-benefit) — no task needed. ✓
**Placeholder scan:** full code in every step; no placeholders.
**Type consistency:** `blocksToMarkdown(blocks: unknown[]): string` identical in Task 1 def and Task 2 use. `read()` returns `PostBody` (`{post,body}`) — the same shape markdown/astro `read()` return and `gatherToneContext` consumes. `toPost(rawPost, cfg, now)` matches core's signature; `canonicalFields`/`readText`/`H`/`doFetch`/`fm` are the notion adapter's existing in-scope bindings.
