# Dashboard Write UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a `/write` page to the dashboard that generates a project-toned draft (Gemini), shows the De-AI report, and saves it as a draft — reusing the existing L2 pipeline via Next server actions.

**Architecture:** A server-only `lib/write.ts` builds deps (config → `selectLLM`/`resolveSource`/`gatherToneContext`) and calls the core pipeline (`generateDraft`+`deAiReview` for generate; `createDraft` for save). Two `'use server'` actions wrap it. A client `WriteForm` drives the flow. Pure formatting/option helpers are unit-tested; the server glue and UI are verified by `next build` (matches the Phase 2 dashboard approach — live generation is already proven via the CLI).

**Tech Stack:** Next.js 15 App Router (server actions + client components), React 19, TypeScript, Vitest.

## Global Constraints

- **Do NOT call the live Gemini API during implementation/verification** — protect the user's paid credits. Verify by `next build` + unit tests only; live generation is already proven via `postdeck write`.
- **`@postdeck/core` stays pure;** dashboard imports adapters/core, never adds SDKs.
- Server-only modules (`lib/write.ts`, `actions.ts`) must not be imported by client components except the `'use server'` action functions and pure helpers/types.
- `.js` import extensions (resolved to `.ts`/`.tsx` via the dashboard's webpack `extensionAlias`).
- Read-only `/` page stays unchanged except an added nav link.
- Additive: all 80 existing tests stay green.

---

## File Structure

**Created:**
- `apps/dashboard/lib/write-format.ts` (+ `write-format.test.ts`) — `deAiSummary`, `projectOptions`, `WritableProject`.
- `apps/dashboard/lib/write.ts` — server glue (`listWritableProjects`, `generateForProject`, `saveDraftForProject`).
- `apps/dashboard/app/write/actions.ts` — `'use server'` `generateAction`, `saveAction`.
- `apps/dashboard/app/write/page.tsx` — server component page.
- `apps/dashboard/components/WriteForm.tsx` — `'use client'` form.

**Modified:**
- `apps/dashboard/app/page.tsx` — add a nav link to `/write`.
- `apps/dashboard/app/globals.css` — minimal styles for the form/result.

---

## Task 1: Pure helpers (`write-format.ts`)

**Files:**
- Create: `apps/dashboard/lib/write-format.ts`, `apps/dashboard/lib/write-format.test.ts`

**Interfaces:**
- Consumes (type-only): `ReviewReport`, `BlogsConfig` (`@postdeck/core`).
- Produces:
  - `interface WritableProject { id: string; name: string }`
  - `projectOptions(config: BlogsConfig): WritableProject[]`
  - `deAiSummary(report: ReviewReport): string`

- [ ] **Step 1: Write the failing test** (`apps/dashboard/lib/write-format.test.ts`)

```ts
import { expect, test } from 'vitest'
import { projectOptions, deAiSummary } from './write-format.js'

test('projectOptions maps id + name (name falls back to id)', () => {
  const cfg = [
    { id: 'a', name: 'Alpha', source: { type: 'markdown', dir: 'd' }, fieldMap: { title: 't', date: 'd', excerpt: 'e' } },
    { id: 'b', source: { type: 'markdown', dir: 'd' }, fieldMap: { title: 't', date: 'd', excerpt: 'e' } },
  ] as any
  expect(projectOptions(cfg)).toEqual([{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'b' }])
})

test('deAiSummary shows before→after per rule, or clean', () => {
  expect(deAiSummary({ before: [], after: [], rewriteNote: '' })).toBe('clean (no AI tics flagged)')
  const r = {
    before: [{ id: 'emoji', label: 'Emoji', matches: ['x', 'y', 'z'], count: 3 }],
    after: [],
    rewriteNote: '',
  }
  expect(deAiSummary(r)).toBe('emoji 3→0')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run apps/dashboard/lib/write-format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/dashboard/lib/write-format.ts`**

```ts
import type { ReviewReport, BlogsConfig } from '@postdeck/core'

export interface WritableProject {
  id: string
  name: string
}

export function projectOptions(config: BlogsConfig): WritableProject[] {
  return config.map((b) => ({ id: b.id, name: b.name ?? b.id }))
}

export function deAiSummary(report: ReviewReport): string {
  const ids = new Set<string>([...report.before.map((f) => f.id), ...report.after.map((f) => f.id)])
  if (ids.size === 0) return 'clean (no AI tics flagged)'
  const b = new Map(report.before.map((f) => [f.id, f.count]))
  const a = new Map(report.after.map((f) => [f.id, f.count]))
  return [...ids].map((id) => `${id} ${b.get(id) ?? 0}→${a.get(id) ?? 0}`).join(', ')
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run apps/dashboard/lib/write-format.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/write-format.ts apps/dashboard/lib/write-format.test.ts
git commit -m "feat(dashboard): pure write helpers (projectOptions, deAiSummary)"
```

---

## Task 2: Server glue + actions + form + page + nav

**Files:**
- Create: `apps/dashboard/lib/write.ts`, `apps/dashboard/app/write/actions.ts`, `apps/dashboard/app/write/page.tsx`, `apps/dashboard/components/WriteForm.tsx`
- Modify: `apps/dashboard/app/page.tsx`, `apps/dashboard/app/globals.css`

**Interfaces:**
- Consumes: core (`resolveSource`, `generateDraft`, `deAiReview`, `slugify`, types `Draft`/`ReviewReport`/`Ref`/`GenerateInput`), adapters (`resolveConfigPath`, `loadBlogsConfig`, `createLocalFs`, `gatherToneContext`, `selectLLM`), `write-format.js` (`projectOptions`, `deAiSummary`, `WritableProject`).
- Produces: `listWritableProjects()`, `generateForProject()`, `saveDraftForProject()`, `generateAction`, `saveAction`, `WriteForm`, `/write` page.

- [ ] **Step 1: Create `apps/dashboard/lib/write.ts`** (server-only glue)

```ts
import {
  resolveSource, generateDraft, deAiReview, slugify,
  type Draft, type ReviewReport, type Ref, type GenerateInput,
} from '@postdeck/core'
import { resolveConfigPath, loadBlogsConfig, createLocalFs, gatherToneContext, selectLLM } from '@postdeck/adapters'
import { projectOptions, type WritableProject } from './write-format.js'

export interface GenerateResult {
  draft: Draft
  report: ReviewReport
}

async function loadConfig() {
  return loadBlogsConfig(resolveConfigPath(process.cwd(), process.env.POSTDECK_CONFIG))
}
const envFn = (n: string) => process.env[n]

export async function listWritableProjects(): Promise<WritableProject[]> {
  return projectOptions(await loadConfig())
}

export async function generateForProject(projectId: string, topic: string, lang?: string): Promise<GenerateResult> {
  const config = await loadConfig()
  const cfg = config.find((b) => b.id === projectId)
  if (!cfg) throw new Error(`no project "${projectId}" in config`)
  const llm = selectLLM({ env: envFn })
  const source = resolveSource(cfg, { fileStore: createLocalFs('/'), env: envFn, fetchImpl: fetch, llm })
  const toneContext = await gatherToneContext(source, cfg)
  const input: GenerateInput = { project: cfg.id, topic, toneContext, lang }
  const draft = await generateDraft(input, llm)
  const reviewed = await deAiReview(draft.body, llm)
  return { draft: { ...draft, body: reviewed.body }, report: reviewed.report }
}

export async function saveDraftForProject(projectId: string, draft: Draft, lang?: string): Promise<Ref> {
  const config = await loadConfig()
  const cfg = config.find((b) => b.id === projectId)
  if (!cfg) throw new Error(`no project "${projectId}" in config`)
  const llm = selectLLM({ env: envFn })
  const source = resolveSource(cfg, { fileStore: createLocalFs('/'), env: envFn, fetchImpl: fetch, llm })
  return source.createDraft({
    slug: slugify(draft.title),
    title: draft.title,
    excerpt: draft.excerpt,
    tags: draft.tags,
    body: draft.body,
    lang,
  })
}
```

- [ ] **Step 2: Create `apps/dashboard/app/write/actions.ts`** (`'use server'`)

```ts
'use server'

import type { Draft, Ref } from '@postdeck/core'
import { generateForProject, saveDraftForProject, type GenerateResult } from '../../lib/write.js'

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function generateAction(
  input: { projectId: string; topic: string; lang?: string },
): Promise<{ ok: true; result: GenerateResult } | { ok: false; error: string }> {
  try {
    if (!input.projectId || !input.topic) return { ok: false, error: 'project and topic are required' }
    const result = await generateForProject(input.projectId, input.topic, input.lang || undefined)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: msg(e) }
  }
}

export async function saveAction(
  input: { projectId: string; draft: Draft; lang?: string },
): Promise<{ ok: true; ref: Ref } | { ok: false; error: string }> {
  try {
    const ref = await saveDraftForProject(input.projectId, input.draft, input.lang || undefined)
    return { ok: true, ref }
  } catch (e) {
    return { ok: false, error: msg(e) }
  }
}
```

- [ ] **Step 3: Create `apps/dashboard/components/WriteForm.tsx`** (`'use client'`)

```tsx
'use client'

import { useState, useTransition } from 'react'
import type { Draft } from '@postdeck/core'
import { generateAction, saveAction } from '../app/write/actions.js'
import { deAiSummary, type WritableProject } from '../lib/write-format.js'

export function WriteForm({ projects }: { projects: WritableProject[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [topic, setTopic] = useState('')
  const [lang, setLang] = useState('')
  const [result, setResult] = useState<{ draft: Draft; summary: string } | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [pending, start] = useTransition()

  const onGenerate = () => {
    setError(''); setSaved(''); setResult(null)
    start(async () => {
      const r = await generateAction({ projectId, topic, lang })
      if (r.ok) setResult({ draft: r.result.draft, summary: deAiSummary(r.result.report) })
      else setError(r.error)
    })
  }

  const onSave = () => {
    if (!result) return
    setError(''); setSaved('')
    start(async () => {
      const r = await saveAction({ projectId, draft: result.draft, lang })
      if (r.ok) setSaved(r.ref.path ?? r.ref.url ?? r.ref.id)
      else setError(r.error)
    })
  }

  return (
    <div>
      <div className="writeform">
        <label>Project{' '}
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>Language{' '}
          <input value={lang} onChange={(e) => setLang(e.target.value)} placeholder="optional, e.g. en" />
        </label>
        <label>Topic
          <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3} />
        </label>
        <button onClick={onGenerate} disabled={pending || !topic || !projectId}>
          {pending ? 'Working…' : 'Generate'}
        </button>
      </div>

      {error && <p className="err">⚠ {error}</p>}

      {result && (
        <div className="result">
          <h3>{result.draft.title}</h3>
          <p><em>{result.draft.excerpt}</em></p>
          <p className="dim">tags: {result.draft.tags.join(', ') || '—'}</p>
          <p className="dim">De-AI: {result.summary}</p>
          <pre>{result.draft.body}</pre>
          <button onClick={onSave} disabled={pending}>Save as draft</button>
          {saved && <p className="ok">saved: {saved}</p>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `apps/dashboard/app/write/page.tsx`**

```tsx
import { listWritableProjects } from '../../lib/write.js'
import { WriteForm } from '../../components/WriteForm.js'

export const dynamic = 'force-dynamic'

export default async function WritePage() {
  const projects = await listWritableProjects()
  return (
    <main>
      <h1>PostDeck — Write</h1>
      <p><a href="/">← dashboard</a></p>
      <WriteForm projects={projects} />
    </main>
  )
}
```

- [ ] **Step 5: Add a nav link in `apps/dashboard/app/page.tsx`** — insert right after the `<h1>PostDeck</h1>` line:

```tsx
      <p><a href="/write">✍ Write a post</a></p>
```

- [ ] **Step 6: Add styles to `apps/dashboard/app/globals.css`** (append)

```css
.writeform { display:flex; flex-direction:column; gap:10px; max-width:640px; margin:12px 0; }
.writeform label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--dim); }
.writeform select, .writeform input, .writeform textarea {
  background:var(--card); color:var(--text); border:1px solid var(--line); border-radius:6px; padding:8px; font:inherit; }
.writeform button, .result button {
  align-self:flex-start; background:var(--pub); color:#04210b; border:0; border-radius:6px;
  padding:8px 14px; font-weight:600; cursor:pointer; }
.writeform button:disabled, .result button:disabled { opacity:.5; cursor:default; }
.result { margin-top:20px; border-top:1px solid var(--line); padding-top:16px; }
.result pre { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:14px; white-space:pre-wrap; overflow-x:auto; }
.ok { color:var(--pub); }
.dim { color:var(--dim); font-size:13px; }
```

- [ ] **Step 7: Build-smoke (NO live generation)**

Run: `pnpm --filter @postdeck/dashboard exec next build`
Expected: "Compiled successfully" + type-check passes; `/` and `/write` both listed as routes (`/write` is `ƒ`/dynamic). Do NOT run the dev server and click Generate (would call the paid Gemini API). A missing-`blogs.config.ts` prerender error is not possible here because both pages are `force-dynamic`. If a real TS/JSX/import error appears, STOP and report.

- [ ] **Step 8: Run unit suite + typecheck**

Run: `pnpm test`
Expected: PASS — 80 prior + 2 write-format = 82.
Run: `pnpm run typecheck`
Expected: clean (packages only; dashboard tsx checked by `next build`).

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/lib/write.ts apps/dashboard/app/write/actions.ts apps/dashboard/app/write/page.tsx apps/dashboard/components/WriteForm.tsx apps/dashboard/app/page.tsx apps/dashboard/app/globals.css
git commit -m "feat(dashboard): /write UI — generate, De-AI report, save draft via server actions"
```

---

## Self-Review

**Spec coverage:** `/write` route + server component page (§1.3) → Task 2. Server actions (§1.2) → Task 2. `lib/write.ts` glue (§1.1) → Task 2. Pure helpers `deAiSummary`/`projectOptions` (§1.4) → Task 1. Generate/save split, revised-body save, slugify → `lib/write.ts` (Task 2). Nav + styles → Task 2. Testing (pure unit + build) → Tasks 1–2. No-live-Gemini constraint honored (build-only verify). ✓

**Placeholder scan:** No placeholders; full code in every step. The server-glue is intentionally build-verified (not fake-deps unit-tested) — matches the Phase 2 dashboard precedent and the fact that `generateDraft`/`deAiReview`/`createDraft` are already unit-tested in core; noted, not a gap.

**Type consistency:** `GenerateResult { draft: Draft; report: ReviewReport }` defined in `lib/write.ts`, consumed by `actions.ts` and (via the action return) `WriteForm`. `WritableProject` defined in `write-format.ts`, consumed by `write.ts`, `page.tsx`, `WriteForm`. `generateForProject(projectId, topic, lang?)` / `saveDraftForProject(projectId, draft, lang?)` signatures match the action call sites. Server-glue builds `SourceDeps` with `llm` and calls `resolveSource`/`gatherToneContext`/`generateDraft`/`deAiReview`/`createDraft` with the same shapes those exports expect.
