# PostDeck Phase 3 — L2 AI Writing + De-AI Review + `postdeck write` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a topic, generate a project-toned blog draft, strip AI tics with a De-AI 2-pass, and save it as a draft via the project's adapter — driven by `postdeck write`.

**Architecture:** The pipeline and De-AI linter live **pure in `@postdeck/core`** with an injected `LLMClient` port (no SDK dependency in core), so the whole moat is testable with a fake LLM. `@postdeck/adapters` provides the real Anthropic-backed `LLMClient`, implements `read()` for the file adapters (markdown/astro), and gathers tone context from existing posts. `apps/cli` adds a `write` subcommand that wires it together. Draft-only — a human publishes (L3).

**Tech Stack:** TypeScript (NodeNext, strict, `verbatimModuleSyntax`), pnpm workspace, Vitest, Zod, `@anthropic-ai/sdk`, jiti, dotenv.

## Global Constraints

- **`@postdeck/core` stays pure:** zod is its only runtime dependency. The `@anthropic-ai/sdk` dependency goes in `@postdeck/adapters` ONLY. core defines the `LLMClient` port; it never imports the SDK.
- **LLM is an injected port:** pipeline functions take an `LLMClient`; the real Anthropic impl is built in adapters and injected at the edge (same pattern as `FileStore`/`fetchImpl`).
- **Draft-only:** the pipeline calls `createDraft` (already implemented in all 3 adapters). No publish, no auto-publish.
- **notion `read()` stays not-implemented:** implement `read()` for markdown + astro only. `gatherToneContext` falls back to `excerpt` when `read()` throws.
- **Model params (verbatim):** `model: 'claude-opus-4-8'`, `max_tokens: 16000`, `thinking: { type: 'adaptive' }`, `output_config: { effort: 'high' }`.
- **Import extensions:** `.js` (NodeNext), even from `.ts`.
- **Test colocation:** unit tests next to source as `*.test.ts`, run under Vitest.
- **Additive:** all 48 existing tests must stay green; do not change existing public signatures.
- **Secrets:** `ANTHROPIC_API_KEY` in the gitignored `.env` (or an `ant auth login` profile); only `.env.example` is committed.

---

## File Structure

**Created (`packages/core/src`):**
- `llm.ts` — `LLMRequest`, `LLMClient` port (types only).
- `slug.ts` (+ `slug.test.ts`) — `slugify`.
- `deai.ts` (+ `deai.test.ts`) — `LintFinding`, `deAiLint` + rule list.
- `prompts.ts` (+ `prompts.test.ts`) — `buildGeneratePrompt`, `buildRewritePrompt`.
- `pipeline.ts` (+ `pipeline.test.ts`) — `ToneContext`, `GenerateInput`, `Draft`, `ReviewReport`, `WriteResult`, `generateDraft`, `deAiReview`, `writeDraft`.

**Modified (`packages/core/src`):**
- `source.ts` — add optional `llm?: LLMClient` to `SourceDeps`.
- `index.ts` — export the new modules.

**Created (`packages/adapters/src`):**
- `anthropic-llm.ts` (+ `anthropic-llm.test.ts`) — `createAnthropicLLM`.
- `tone.ts` (+ `tone.test.ts`) — `gatherToneContext`.

**Modified (`packages/adapters/src`):**
- `markdown.ts` — implement `read()`.
- `astro-collection.ts` — implement `read()`.
- `index.ts` — export `createAnthropicLLM`, `gatherToneContext`.
- `packages/adapters/package.json` — add `@anthropic-ai/sdk`.

**Created/Modified (`apps/cli`):**
- `src/write.ts` (+ `src/write.test.ts`) — `parseWriteArgs`, `runWrite`.
- `src/main.ts` — branch to `write` subcommand.

**Modified (root):**
- `.env.example` — add `ANTHROPIC_API_KEY`.

---

## Task 1: De-AI rule linter (`deAiLint`)

**Files:**
- Create: `packages/core/src/deai.ts`, `packages/core/src/deai.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface LintFinding { id: string; label: string; matches: string[]; count: number }`
  - `deAiLint(text: string): LintFinding[]` — one finding per rule that matched, in rule order.

- [ ] **Step 1: Write the failing test** (`packages/core/src/deai.test.ts`)

```ts
import { expect, test } from 'vitest'
import { deAiLint } from './index.js'

const BAD = `However, this is great. Moreover, it is fine. In this article we explore it. In conclusion, it's worth noting the value 🎉. Furthermore, additionally, thus we conclude.`
const CLEAN = `The invoice went out Tuesday. She paid within the hour. No reminder needed. That surprised me, honestly.`

test('deAiLint flags overused connectors, clichés, listicle padding, and emoji in a bad sample', () => {
  const ids = deAiLint(BAD).map((f) => f.id)
  expect(ids).toContain('overused-connectors')
  expect(ids).toContain('cliche-phrases')
  expect(ids).toContain('listicle-padding')
  expect(ids).toContain('emoji')
})

test('deAiLint counts connector matches', () => {
  const conn = deAiLint(BAD).find((f) => f.id === 'overused-connectors')!
  expect(conn.count).toBeGreaterThanOrEqual(3) // however, moreover, furthermore, additionally, thus
})

test('deAiLint returns [] for clean human prose', () => {
  expect(deAiLint(CLEAN)).toEqual([])
})

test('deAiLint flags uniform sentence length', () => {
  const uniform = 'One two three four five words. Six seven eight nine ten here. Eleven twelve thirteen fourteen fifteen now. Sixteen seventeen eighteen nineteen twenty go.'
  const ids = deAiLint(uniform).map((f) => f.id)
  expect(ids).toContain('uniform-sentence-length')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/deai.test.ts`
Expected: FAIL — `deAiLint` not exported.

- [ ] **Step 3: Implement `packages/core/src/deai.ts`**

```ts
export interface LintFinding {
  id: string
  label: string
  matches: string[]
  count: number
}

interface Rule {
  id: string
  label: string
  find: (text: string) => string[]
}

const wordRule = (id: string, label: string, words: string[]): Rule => ({
  id,
  label,
  find: (text) => text.match(new RegExp(`\\b(${words.join('|')})\\b`, 'gi')) ?? [],
})

const RULES: Rule[] = [
  wordRule('overused-connectors', 'Overused connectors', [
    'however', 'moreover', 'furthermore', 'additionally', 'thus',
  ]),
  {
    id: 'cliche-phrases',
    label: 'Cliché phrases',
    find: (t) => t.match(/(in conclusion|it'?s worth noting|that said|at the end of the day|when it comes to)/gi) ?? [],
  },
  {
    id: 'em-dash-overuse',
    label: 'Em-dash overuse',
    find: (t) => {
      const dashes = t.match(/—/g) ?? []
      const sentences = t.split(/[.!?]+/).filter((s) => s.trim()).length || 1
      return dashes.length / sentences > 0.5 ? dashes : []
    },
  },
  {
    id: 'uniform-sentence-length',
    label: 'Uniform sentence length',
    find: (t) => {
      const lens = t
        .split(/[.!?]+/)
        .map((s) => s.trim().split(/\s+/).filter(Boolean).length)
        .filter((n) => n > 0)
      if (lens.length < 4) return []
      const mean = lens.reduce((a, b) => a + b, 0) / lens.length
      const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length
      const cv = Math.sqrt(variance) / (mean || 1)
      return cv < 0.25 ? [`cv=${cv.toFixed(2)}`] : []
    },
  },
  {
    id: 'listicle-padding',
    label: 'Listicle padding',
    find: (t) => t.match(/(here are \d+|let'?s dive in|in this article|without further ado)/gi) ?? [],
  },
  {
    id: 'emoji',
    label: 'Emoji',
    find: (t) => t.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? [],
  },
]

export function deAiLint(text: string): LintFinding[] {
  const out: LintFinding[] = []
  for (const r of RULES) {
    const matches = r.find(text)
    if (matches.length > 0) out.push({ id: r.id, label: r.label, matches, count: matches.length })
  }
  return out
}
```

- [ ] **Step 4: Export from `packages/core/src/index.ts`** — add after the existing exports:

```ts
export * from './deai.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/deai.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/deai.ts packages/core/src/deai.test.ts packages/core/src/index.ts
git commit -m "feat(core): De-AI rule linter (deAiLint)"
```

---

## Task 2: `LLMClient` port + `slugify` + pipeline types + `SourceDeps.llm`

**Files:**
- Create: `packages/core/src/llm.ts`, `packages/core/src/slug.ts`, `packages/core/src/slug.test.ts`, `packages/core/src/pipeline.ts`
- Modify: `packages/core/src/source.ts`, `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface LLMRequest { system?: string; prompt: string }`
  - `interface LLMClient { complete(req: LLMRequest): Promise<string> }`
  - `slugify(title: string): string`
  - pipeline shared types (functions added in Tasks 4–6): `ToneContext`, `GenerateInput`, `Draft`
  - `SourceDeps` gains optional `llm?: LLMClient`.

> The pipeline shared **types** are created here (empty of functions) so later tasks — and the prompt builders in Task 3 — can import them without a forward reference. Tasks 4–6 append the functions to `pipeline.ts`.

- [ ] **Step 1: Write the failing test** (`packages/core/src/slug.test.ts`)

```ts
import { expect, test } from 'vitest'
import { slugify } from './index.js'

test('slugify lowercases and hyphenates', () => {
  expect(slugify('Hello, World!')).toBe('hello-world')
})
test('slugify collapses whitespace and underscores', () => {
  expect(slugify('  Multiple   Spaces_here  ')).toBe('multiple-spaces-here')
})
test('slugify strips leading/trailing hyphens', () => {
  expect(slugify('— Dashy —')).toBe('dashy')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/slug.test.ts`
Expected: FAIL — `slugify` not exported.

- [ ] **Step 3: Create `packages/core/src/llm.ts`**

```ts
export interface LLMRequest {
  system?: string
  prompt: string
}

export interface LLMClient {
  complete(req: LLMRequest): Promise<string>
}
```

- [ ] **Step 4: Create `packages/core/src/slug.ts`**

```ts
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

- [ ] **Step 4b: Create `packages/core/src/pipeline.ts` with the shared types (functions come in Tasks 4–6)**

```ts
export interface ToneContext {
  projectName: string
  samples: { title: string; snippet: string }[]
}

export interface GenerateInput {
  project: string
  topic: string
  toneContext: ToneContext
  lang?: string
}

export interface Draft {
  title: string
  excerpt: string
  tags: string[]
  body: string
}
```

- [ ] **Step 5: Add `llm?` to `SourceDeps` in `packages/core/src/source.ts`**

Add the import at the top (next to the existing type imports):

```ts
import type { LLMClient } from './llm.js'
```

Replace the `SourceDeps` interface with:

```ts
export interface SourceDeps {
  fileStore?: FileStore
  env: (name: string) => string | undefined
  fetchImpl?: typeof fetch
  llm?: LLMClient
}
```

- [ ] **Step 6: Export from `packages/core/src/index.ts`** — add:

```ts
export * from './llm.js'
export * from './slug.js'
export * from './pipeline.js'
```

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm vitest run packages/core/src/slug.test.ts`
Expected: PASS (3 tests).
Run: `pnpm run typecheck`
Expected: clean (adding an optional field to `SourceDeps` doesn't break existing consumers).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/llm.ts packages/core/src/slug.ts packages/core/src/slug.test.ts packages/core/src/pipeline.ts packages/core/src/source.ts packages/core/src/index.ts
git commit -m "feat(core): LLMClient port, slugify, pipeline types, SourceDeps.llm"
```

---

## Task 3: Prompt builders

**Files:**
- Create: `packages/core/src/prompts.ts`, `packages/core/src/prompts.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `LintFinding` (from `./deai.js`), `GenerateInput` (from `./pipeline.js` — the type exists as of Task 2; type-only import).
- Produces:
  - `buildGeneratePrompt(input: GenerateInput): { system: string; prompt: string }`
  - `buildRewritePrompt(body: string, findings: LintFinding[]): { system: string; prompt: string }`

- [ ] **Step 1: Write the failing test** (`packages/core/src/prompts.test.ts`)

```ts
import { expect, test } from 'vitest'
import { buildGeneratePrompt, buildRewritePrompt } from './index.js'

const input = {
  project: 'hongix',
  topic: 'How to price freelance work',
  toneContext: {
    projectName: 'Hongix',
    samples: [{ title: 'Sample One', snippet: 'A short human paragraph.' }],
  },
  lang: 'en',
}

test('buildGeneratePrompt includes project name, topic, sample, and JSON instruction', () => {
  const { system, prompt } = buildGeneratePrompt(input)
  expect(system).toContain('Hongix')
  expect(prompt).toContain('How to price freelance work')
  expect(prompt).toContain('Sample One')
  expect(prompt).toContain('JSON')
})

test('buildRewritePrompt lists findings and includes the body', () => {
  const { prompt } = buildRewritePrompt('the body text', [
    { id: 'emoji', label: 'Emoji', matches: ['🎉'], count: 1 },
  ])
  expect(prompt).toContain('Emoji')
  expect(prompt).toContain('the body text')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/prompts.test.ts`
Expected: FAIL — `buildGeneratePrompt` not exported.

- [ ] **Step 3: Implement `packages/core/src/prompts.ts`**

```ts
import type { GenerateInput } from './pipeline.js'
import type { LintFinding } from './deai.js'

export function buildGeneratePrompt(input: GenerateInput): { system: string; prompt: string } {
  const samples = input.toneContext.samples
    .map((s, i) => `Example ${i + 1} — "${s.title}":\n${s.snippet}`)
    .join('\n\n')
  const system =
    `You are a blog writer for "${input.toneContext.projectName}". ` +
    `Match the voice, tone, and structure of the examples. Write like a human, not an AI. ` +
    `Avoid overused connectors (however, moreover), clichés ("in conclusion", "it's worth noting"), ` +
    `em-dash overuse, uniform sentence length, listicle padding, and emoji.`
  const prompt =
    `Voice examples from this blog:\n\n${samples}\n\n` +
    `Write a new blog post on this topic: "${input.topic}"` +
    `${input.lang ? ` (language: ${input.lang})` : ''}.\n\n` +
    `Return ONLY a JSON object with keys: title (string), excerpt (string, one sentence), ` +
    `tags (string[]), body (string, markdown). No prose outside the JSON.`
  return { system, prompt }
}

export function buildRewritePrompt(body: string, findings: LintFinding[]): { system: string; prompt: string } {
  const issues = findings.length
    ? findings.map((f) => `- ${f.label}: ${f.matches.slice(0, 5).join(', ')}`).join('\n')
    : '- (none flagged, but still tighten any AI-sounding phrasing)'
  const system =
    `You rewrite blog drafts to sound human. Preserve meaning, facts, and structure. ` +
    `Fix the flagged AI tics. Do not add emoji or clichés.`
  const prompt =
    `Rewrite the following markdown so it reads like a human wrote it. Fix these flagged issues:\n${issues}\n\n` +
    `Return ONLY the rewritten markdown body — no JSON, no commentary.\n\n---\n${body}`
  return { system, prompt }
}
```

- [ ] **Step 4: Export from `packages/core/src/index.ts`** — add:

```ts
export * from './prompts.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/prompts.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/prompts.ts packages/core/src/prompts.test.ts packages/core/src/index.ts
git commit -m "feat(core): generate + rewrite prompt builders"
```

---

## Task 4: `generateDraft`

**Files:**
- Create: `packages/core/src/pipeline.test.ts`
- Modify: `packages/core/src/pipeline.ts` (append `parseDraftJson` + `generateDraft`; the `ToneContext`/`GenerateInput`/`Draft` types already exist from Task 2)

**Interfaces:**
- Consumes: `LLMClient` (`./llm.js`), `buildGeneratePrompt` (`./prompts.js`), the `GenerateInput`/`Draft` types (already in `pipeline.ts`).
- Produces: `generateDraft(input: GenerateInput, llm: LLMClient): Promise<Draft>`

- [ ] **Step 1: Write the failing test** (`packages/core/src/pipeline.test.ts`)

```ts
import { expect, test } from 'vitest'
import { generateDraft } from './index.js'
import type { LLMClient, GenerateInput } from './index.js'

const INPUT: GenerateInput = {
  project: 'p',
  topic: 't',
  toneContext: { projectName: 'P', samples: [{ title: 'A', snippet: 's' }] },
}
const fakeLLM = (responses: string[]): LLMClient => {
  let i = 0
  return { complete: async () => responses[i++] ?? '' }
}

test('generateDraft parses a JSON draft (fenced)', async () => {
  const llm = fakeLLM(['```json\n{"title":"T","excerpt":"E","tags":["x"],"body":"B"}\n```'])
  const d = await generateDraft(INPUT, llm)
  expect(d).toEqual({ title: 'T', excerpt: 'E', tags: ['x'], body: 'B' })
})

test('generateDraft parses bare JSON and defaults missing excerpt/tags', async () => {
  const llm = fakeLLM(['{"title":"T","body":"B"}'])
  const d = await generateDraft(INPUT, llm)
  expect(d).toEqual({ title: 'T', excerpt: '', tags: [], body: 'B' })
})

test('generateDraft throws on non-JSON output', async () => {
  const llm = fakeLLM(['not json at all'])
  await expect(generateDraft(INPUT, llm)).rejects.toThrow(/valid JSON/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/pipeline.test.ts`
Expected: FAIL — `generateDraft` not exported.

- [ ] **Step 3: Extend `packages/core/src/pipeline.ts`** — add the import line at the top of the file (above the existing type interfaces), then append `parseDraftJson` + `generateDraft`:

Top of file:

```ts
import type { LLMClient } from './llm.js'
import { buildGeneratePrompt } from './prompts.js'
```

Append after the existing `Draft` interface:

```ts
function parseDraftJson(text: string): Draft {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced ? fenced[1] : text).trim()
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    throw new Error(`generateDraft: LLM did not return valid JSON:\n${text.slice(0, 200)}`)
  }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.title !== 'string' || typeof o.body !== 'string') {
    throw new Error('generateDraft: JSON missing required string fields title/body')
  }
  return {
    title: o.title,
    excerpt: typeof o.excerpt === 'string' ? o.excerpt : '',
    tags: Array.isArray(o.tags) ? o.tags.map(String) : [],
    body: o.body,
  }
}

export async function generateDraft(input: GenerateInput, llm: LLMClient): Promise<Draft> {
  const { system, prompt } = buildGeneratePrompt(input)
  const text = await llm.complete({ system, prompt })
  return parseDraftJson(text)
}
```

- [ ] **Step 4: Run pipeline test + typecheck** (`pipeline.js` is already exported from `index.ts` since Task 2)

Run: `pnpm vitest run packages/core/src/pipeline.test.ts`
Expected: PASS (3 tests).
Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pipeline.ts packages/core/src/pipeline.test.ts
git commit -m "feat(core): generateDraft (defensive JSON parse)"
```

---

## Task 5: `deAiReview` (lint → rewrite → lint)

**Files:**
- Modify: `packages/core/src/pipeline.ts`, `packages/core/src/pipeline.test.ts`

**Interfaces:**
- Consumes: `deAiLint`/`LintFinding` (`./deai.js`), `buildRewritePrompt` (`./prompts.js`), `LLMClient`.
- Produces:
  - `interface ReviewReport { before: LintFinding[]; after: LintFinding[]; rewriteNote: string }`
  - `deAiReview(body: string, llm: LLMClient): Promise<{ body: string; report: ReviewReport }>`

- [ ] **Step 1: Add the failing test** (append to `packages/core/src/pipeline.test.ts`)

```ts
import { deAiReview } from './index.js'

test('deAiReview lints, rewrites, and re-lints', async () => {
  const dirty = 'However, this is great. Moreover, it is fine. Furthermore we go. Additionally, thus done.'
  const clean = 'The tool works. I use it daily. It saved me time. No complaints.'
  const llm = fakeLLM([clean]) // one rewrite call
  const { body, report } = await deAiReview(dirty, llm)
  expect(body).toBe(clean)
  expect(report.before.some((f) => f.id === 'overused-connectors')).toBe(true)
  expect(report.after).toEqual([]) // clean rewrite has no findings
  expect(report.rewriteNote).toMatch(/chars/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/pipeline.test.ts`
Expected: FAIL — `deAiReview` not exported.

- [ ] **Step 3: Extend `packages/core/src/pipeline.ts`**

Update the imports at the top:

```ts
import type { LLMClient } from './llm.js'
import { buildGeneratePrompt, buildRewritePrompt } from './prompts.js'
import { deAiLint, type LintFinding } from './deai.js'
```

Append:

```ts
export interface ReviewReport {
  before: LintFinding[]
  after: LintFinding[]
  rewriteNote: string
}

export async function deAiReview(body: string, llm: LLMClient): Promise<{ body: string; report: ReviewReport }> {
  const before = deAiLint(body)
  const { system, prompt } = buildRewritePrompt(body, before)
  const rewritten = (await llm.complete({ system, prompt })).trim()
  const after = deAiLint(rewritten)
  return {
    body: rewritten,
    report: { before, after, rewriteNote: `rewrote ${body.length}→${rewritten.length} chars` },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/src/pipeline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pipeline.ts packages/core/src/pipeline.test.ts
git commit -m "feat(core): deAiReview 2-pass (lint, rewrite, re-lint)"
```

---

## Task 6: `writeDraft` orchestrator

**Files:**
- Modify: `packages/core/src/pipeline.ts`, `packages/core/src/pipeline.test.ts`

**Interfaces:**
- Consumes: `generateDraft`, `deAiReview`, `slugify` (`./slug.js`), `BlogSource` (`./source.js`), `Ref` (`./post.js`).
- Produces:
  - `interface WriteResult { draft: Draft; report: ReviewReport }`
  - `writeDraft(input: GenerateInput, deps: { llm: LLMClient; source: BlogSource }): Promise<{ ref: Ref; result: WriteResult }>`

- [ ] **Step 1: Add the failing test** (append to `packages/core/src/pipeline.test.ts`)

```ts
import { writeDraft } from './index.js'
import type { BlogSource, DraftInput } from './index.js'

test('writeDraft generates, reviews, and saves the REVISED body via createDraft', async () => {
  const llm = fakeLLM([
    '{"title":"My Post","excerpt":"E","tags":["a"],"body":"However, raw AI body."}', // generate
    'Clean human body.', // rewrite
  ])
  let saved: DraftInput | undefined
  const source: BlogSource = {
    capabilities: { canWrite: true, enforcesFutureDates: false, supportsTranslations: false },
    list: async () => [],
    read: async () => { throw new Error('nope') },
    createDraft: async (input) => { saved = input; return { id: input.slug, path: `x/${input.slug}.md` } },
  }
  const { ref, result } = await writeDraft(INPUT, { llm, source })
  expect(saved?.slug).toBe('my-post')          // slugified title
  expect(saved?.body).toBe('Clean human body.') // revised, not raw
  expect(saved?.title).toBe('My Post')
  expect(ref.path).toBe('x/my-post.md')
  expect(result.report.before.some((f) => f.id === 'overused-connectors')).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/pipeline.test.ts`
Expected: FAIL — `writeDraft` not exported.

- [ ] **Step 3: Extend `packages/core/src/pipeline.ts`**

Add to the imports at the top:

```ts
import type { BlogSource } from './source.js'
import type { Ref } from './post.js'
import { slugify } from './slug.js'
```

Append:

```ts
export interface WriteResult {
  draft: Draft
  report: ReviewReport
}

export async function writeDraft(
  input: GenerateInput,
  deps: { llm: LLMClient; source: BlogSource },
): Promise<{ ref: Ref; result: WriteResult }> {
  const generated = await generateDraft(input, deps.llm)
  const reviewed = await deAiReview(generated.body, deps.llm)
  const draft: Draft = { ...generated, body: reviewed.body }
  const ref = await deps.source.createDraft({
    slug: slugify(draft.title),
    title: draft.title,
    excerpt: draft.excerpt,
    tags: draft.tags,
    body: draft.body,
    lang: input.lang,
  })
  return { ref, result: { draft, report: reviewed.report } }
}
```

- [ ] **Step 4: Run test + full suite + typecheck**

Run: `pnpm vitest run packages/core/src/pipeline.test.ts`
Expected: PASS.
Run: `pnpm test`
Expected: PASS — all prior tests green plus the new core tests.
Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pipeline.ts packages/core/src/pipeline.test.ts
git commit -m "feat(core): writeDraft orchestrator (generate -> review -> createDraft)"
```

---

## Task 7: file-adapter `read()` (markdown + astro)

**Files:**
- Modify: `packages/adapters/src/markdown.ts`, `packages/adapters/src/astro-collection.ts`
- Test: `packages/adapters/src/markdown.test.ts` (append), `packages/adapters/src/astro-collection.test.ts` (append)

**Interfaces:**
- Consumes: `parseFrontmatter` (`./frontmatter.js`), `toPost` + `RawPost`/`PostBody` (`@postdeck/core`), the adapter's `createLocalFs` store.
- Produces: `source.read(id)` returns `{ post, body }` for markdown and astro. notion `read()` still throws.

- [ ] **Step 1: Add failing tests**

Append to `packages/adapters/src/markdown.test.ts`:

```ts
test('markdown read() returns the post and body for a slug', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-mdread-'))
  mkdirSync(join(root, 'guides'), { recursive: true })
  writeFileSync(join(root, 'guides/hello.md'), '---\ntitle: Hello\ndate: "2026-01-01"\ndescription: d\n---\nBody line one.\nBody line two.\n', 'utf8')
  const src = markdownFactory(
    { id: 'g', source: { type: 'markdown', dir: 'guides' }, fieldMap: { title: 'title', date: 'date', excerpt: 'description' } } as any,
    { env: () => undefined, fileStore: createLocalFs(root) },
  )
  const { post, body } = await src.read('hello')
  expect(post.title).toBe('Hello')
  expect(body).toContain('Body line one.')
})
```

(Ensure `markdown.test.ts` already imports `markdownFactory` from `./markdown.js` and `createLocalFs` from `./localfs.js`; add any missing imports — `mkdtempSync, mkdirSync, writeFileSync` from `node:fs`, `tmpdir` from `node:os`, `join` from `node:path`.)

Append to `packages/adapters/src/astro-collection.test.ts`:

```ts
test('astro read() returns post + body for lang/slug (.md and .mdx)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-astroread-'))
  mkdirSync(join(root, 'blog/en'), { recursive: true })
  writeFileSync(join(root, 'blog/en/post-a.md'), '---\ntitle: A\ndate: "2026-01-01"\ndescription: d\n---\nAlpha body.\n', 'utf8')
  writeFileSync(join(root, 'blog/en/post-b.mdx'), '---\ntitle: B\ndate: "2026-01-01"\ndescription: d\n---\nBeta body.\n', 'utf8')
  const src = astroCollectionFactory(
    { id: 'r', source: { type: 'astro-collection', dir: 'blog', langs: ['en'] }, fieldMap: { title: 'title', date: 'date', excerpt: 'description' } } as any,
    { env: () => undefined, fileStore: createLocalFs(root) },
  )
  expect((await src.read('en/post-a')).body).toContain('Alpha body.')
  expect((await src.read('en/post-b')).body).toContain('Beta body.')
})
```

(Ensure `astro-collection.test.ts` imports `astroCollectionFactory` from `./astro-collection.js` and the same node builtins + `createLocalFs`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/adapters/src/markdown.test.ts packages/adapters/src/astro-collection.test.ts`
Expected: FAIL — `read()` throws `not implemented until L2`.

- [ ] **Step 3: Implement markdown `read()`** in `packages/adapters/src/markdown.ts`

Update the top import to pull in `toPost`, `RawPost`, and `PostBody`:

```ts
import type { SourceFactory, BlogSource, RawPost, DraftInput, Ref, FieldMap, PostBody } from '@postdeck/core'
import { toPost } from '@postdeck/core'
```

Replace the `async read()` stub with:

```ts
    async read(id: string): Promise<PostBody> {
      const files = (await fs.list(dir)).filter((f) => f.endsWith('.md'))
      for (const f of files) {
        const parsed = parseFrontmatter(await fs.read(`${dir}/${f}`))
        const raw = parsed.data
        const slug = String(raw[fm.slug ?? 'slug'] ?? basename(f, '.md'))
        if (slug !== id) continue
        const rawPost: RawPost = { id: slug, slug, fields: canonicalFields(raw, fm), raw }
        return { post: toPost(rawPost, cfg, new Date()), body: parsed.body }
      }
      throw new Error(`markdown read: no post with id "${id}" in ${dir}`)
    },
```

- [ ] **Step 4: Implement astro `read()`** in `packages/adapters/src/astro-collection.ts`

Update the top import:

```ts
import type { SourceFactory, BlogSource, RawPost, DraftInput, Ref, FieldMap, PostBody } from '@postdeck/core'
import { toPost } from '@postdeck/core'
```

Replace the `async read()` stub with:

```ts
    async read(id: string): Promise<PostBody> {
      const slash = id.indexOf('/')
      const lang = slash >= 0 ? id.slice(0, slash) : src.langs[0]
      const slug = slash >= 0 ? id.slice(slash + 1) : id
      for (const ext of ['.md', '.mdx']) {
        const path = `${src.dir}/${lang}/${slug}${ext}`
        try {
          const parsed = parseFrontmatter(await fs.read(path))
          const rawPost: RawPost = { id: `${lang}/${slug}`, slug, lang, fields: canonicalFields(parsed.data, fm), raw: parsed.data }
          return { post: toPost(rawPost, cfg, new Date()), body: parsed.body }
        } catch (e: any) {
          if (e?.code === 'ENOENT') continue
          throw e
        }
      }
      throw new Error(`astro read: no post for id "${id}" (${lang}/${slug}.md|.mdx) in ${src.dir}`)
    },
```

- [ ] **Step 5: Run tests + full suite + typecheck**

Run: `pnpm vitest run packages/adapters/src/markdown.test.ts packages/adapters/src/astro-collection.test.ts`
Expected: PASS.
Run: `pnpm test`
Expected: PASS.
Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/markdown.ts packages/adapters/src/markdown.test.ts packages/adapters/src/astro-collection.ts packages/adapters/src/astro-collection.test.ts
git commit -m "feat(adapters): implement read() for markdown + astro (notion still deferred)"
```

---

## Task 8: `gatherToneContext`

**Files:**
- Create: `packages/adapters/src/tone.ts`, `packages/adapters/src/tone.test.ts`
- Modify: `packages/adapters/src/index.ts`

**Interfaces:**
- Consumes: `BlogSource`, `BlogConfig`, `ToneContext` (all from `@postdeck/core`).
- Produces: `gatherToneContext(source: BlogSource, cfg: BlogConfig, opts?: { max?: number }): Promise<ToneContext>`

- [ ] **Step 1: Write the failing test** (`packages/adapters/src/tone.test.ts`)

```ts
import { expect, test } from 'vitest'
import type { BlogSource, RawPost } from '@postdeck/core'
import { gatherToneContext } from './index.js'

const raws: RawPost[] = [
  { id: 'a', slug: 'a', fields: { title: 'A', excerpt: 'exc-a' }, raw: {} },
  { id: 'b', slug: 'b', fields: { title: 'B', excerpt: 'exc-b' }, raw: {} },
]
const base = { capabilities: { canWrite: true, enforcesFutureDates: false, supportsTranslations: false }, list: async () => raws, createDraft: async () => ({ id: 'x' }) }
const cfg = { id: 'p', name: 'P', source: { type: 'markdown', dir: 'd' }, fieldMap: { title: 'title', date: 'date', excerpt: 'excerpt' } } as any

test('gatherToneContext uses body snippets when read() works', async () => {
  const source: BlogSource = { ...base, read: async (id) => ({ post: {} as any, body: `body-of-${id}` }) }
  const tone = await gatherToneContext(source, cfg)
  expect(tone.projectName).toBe('P')
  expect(tone.samples[0]).toEqual({ title: 'A', snippet: 'body-of-a' })
})

test('gatherToneContext falls back to excerpt when read() throws (notion)', async () => {
  const source: BlogSource = { ...base, read: async () => { throw new Error('not implemented until L2') } }
  const tone = await gatherToneContext(source, cfg)
  expect(tone.samples[0]).toEqual({ title: 'A', snippet: 'exc-a' })
})

test('gatherToneContext respects max', async () => {
  const source: BlogSource = { ...base, read: async (id) => ({ post: {} as any, body: id }) }
  const tone = await gatherToneContext(source, cfg, { max: 1 })
  expect(tone.samples).toHaveLength(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/adapters/src/tone.test.ts`
Expected: FAIL — `gatherToneContext` not exported.

- [ ] **Step 3: Implement `packages/adapters/src/tone.ts`**

```ts
import type { BlogSource, BlogConfig, ToneContext } from '@postdeck/core'

export async function gatherToneContext(
  source: BlogSource,
  cfg: BlogConfig,
  opts?: { max?: number },
): Promise<ToneContext> {
  const max = opts?.max ?? 3
  const raws = await source.list()
  const chosen = raws.slice(0, max)
  const samples: { title: string; snippet: string }[] = []
  for (const r of chosen) {
    const title = String(r.fields.title ?? r.slug)
    let snippet: string
    try {
      const { body } = await source.read(r.id)
      snippet = body.trim().slice(0, 500)
    } catch {
      snippet = String(r.fields.excerpt ?? '')
    }
    samples.push({ title, snippet })
  }
  return { projectName: cfg.name ?? cfg.id, samples }
}
```

- [ ] **Step 4: Export from `packages/adapters/src/index.ts`** — add:

```ts
export { gatherToneContext } from './tone.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/adapters/src/tone.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/tone.ts packages/adapters/src/tone.test.ts packages/adapters/src/index.ts
git commit -m "feat(adapters): gatherToneContext (body snippets + excerpt fallback)"
```

---

## Task 9: `createAnthropicLLM` (real `LLMClient`)

**Files:**
- Create: `packages/adapters/src/anthropic-llm.ts`, `packages/adapters/src/anthropic-llm.test.ts`
- Modify: `packages/adapters/src/index.ts`, `packages/adapters/package.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `LLMClient`, `LLMRequest` (`@postdeck/core`), `@anthropic-ai/sdk`.
- Produces: `createAnthropicLLM(deps: { env: (n: string) => string | undefined }): LLMClient`

- [ ] **Step 1: Add the dependency**

Run: `pnpm add @anthropic-ai/sdk --filter @postdeck/adapters`
Expected: installs the latest SDK and adds it to `packages/adapters/package.json` + `pnpm-lock.yaml`.

- [ ] **Step 2: Write the failing test** (`packages/adapters/src/anthropic-llm.test.ts`)

```ts
import { expect, test } from 'vitest'
import { createAnthropicLLM } from './index.js'

test('createAnthropicLLM returns an LLMClient with a complete() function', () => {
  // Passing a dummy key lets the SDK client construct without network access.
  const llm = createAnthropicLLM({ env: (n) => (n === 'ANTHROPIC_API_KEY' ? 'sk-test-dummy' : undefined) })
  expect(typeof llm.complete).toBe('function')
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/adapters/src/anthropic-llm.test.ts`
Expected: FAIL — `createAnthropicLLM` not exported.

- [ ] **Step 4: Implement `packages/adapters/src/anthropic-llm.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk'
import type { LLMClient, LLMRequest } from '@postdeck/core'

// Edge adapter for the LLMClient port. The request params object is typed `any`
// on purpose: `thinking: {type:'adaptive'}` and `output_config.effort` are recent
// API fields that may not exist in the installed SDK's static types. Behavior is
// validated end-to-end in Task 11.
export function createAnthropicLLM(deps: { env: (n: string) => string | undefined }): LLMClient {
  const apiKey = deps.env('ANTHROPIC_API_KEY')
  const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic()
  return {
    async complete(req: LLMRequest): Promise<string> {
      const params: any = {
        model: 'claude-opus-4-8',
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        messages: [{ role: 'user', content: req.prompt }],
      }
      if (req.system) params.system = req.system
      const res = await client.messages.create(params)
      const blocks = res.content as Array<{ type: string; text?: string }>
      return blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
    },
  }
}
```

- [ ] **Step 5: Export from `packages/adapters/src/index.ts`** — add:

```ts
export { createAnthropicLLM } from './anthropic-llm.js'
```

- [ ] **Step 6: Add `ANTHROPIC_API_KEY` to `.env.example`** — append:

```
# L2 AI writing (postdeck write). Or use `ant auth login` instead of a key.
ANTHROPIC_API_KEY=sk-ant-xxx
```

- [ ] **Step 7: Run test + typecheck**

Run: `pnpm vitest run packages/adapters/src/anthropic-llm.test.ts`
Expected: PASS.
Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/adapters/src/anthropic-llm.ts packages/adapters/src/anthropic-llm.test.ts packages/adapters/src/index.ts packages/adapters/package.json pnpm-lock.yaml .env.example
git commit -m "feat(adapters): createAnthropicLLM (opus-4-8, adaptive thinking)"
```

---

## Task 10: `postdeck write` CLI

**Files:**
- Create: `apps/cli/src/write.ts`, `apps/cli/src/write.test.ts`
- Modify: `apps/cli/src/main.ts`

**Interfaces:**
- Consumes: `resolveConfigPath`/`loadBlogsConfig`/`createLocalFs`/`gatherToneContext`/`createAnthropicLLM` (`@postdeck/adapters`), `resolveSource`/`generateDraft`/`deAiReview`/`writeDraft`/`slugify` (`@postdeck/core`), `dotenv`.
- Produces:
  - `parseWriteArgs(argv: string[]): { project?: string; topic?: string; lang?: string; dryRun: boolean; config?: string }`
  - `runWrite(argv: string[]): Promise<void>`
  - `main()` branches to `write` when `process.argv[2] === 'write'`.

- [ ] **Step 1: Write the failing test** (`apps/cli/src/write.test.ts`)

```ts
import { expect, test } from 'vitest'
import { parseWriteArgs } from './write.js'

test('parseWriteArgs reads project/topic/lang/config and dry-run', () => {
  expect(parseWriteArgs(['--project', 'hongix', '--topic', 'Pricing work', '--lang', 'en', '--dry-run'])).toEqual({
    project: 'hongix', topic: 'Pricing work', lang: 'en', dryRun: true, config: undefined,
  })
})
test('parseWriteArgs defaults dryRun to false and fields to undefined', () => {
  expect(parseWriteArgs([])).toEqual({ project: undefined, topic: undefined, lang: undefined, dryRun: false, config: undefined })
})
test('parseWriteArgs captures --config', () => {
  expect(parseWriteArgs(['--config', 'custom.ts']).config).toBe('custom.ts')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/cli/src/write.test.ts`
Expected: FAIL — `./write.js` not found.

- [ ] **Step 3: Implement `apps/cli/src/write.ts`**

```ts
import { resolve } from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { resolveSource, generateDraft, deAiReview, writeDraft, type GenerateInput, type Draft, type ReviewReport } from '@postdeck/core'
import { resolveConfigPath, loadBlogsConfig, createLocalFs, gatherToneContext, createAnthropicLLM } from '@postdeck/adapters'

export interface WriteArgs {
  project?: string
  topic?: string
  lang?: string
  dryRun: boolean
  config?: string
}

export function parseWriteArgs(argv: string[]): WriteArgs {
  const out: WriteArgs = { project: undefined, topic: undefined, lang: undefined, dryRun: false, config: undefined }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--project') out.project = argv[++i]
    else if (a === '--topic') out.topic = argv[++i]
    else if (a === '--lang') out.lang = argv[++i]
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--config') out.config = argv[++i]
  }
  return out
}

const fmtCounts = (findings: ReviewReport['before']) =>
  findings.length ? findings.map((f) => `${f.id} ${f.count}`).join(', ') : 'none'

function printDraftAndReport(draft: Draft, report: ReviewReport): void {
  console.log('\n=== DRAFT ===')
  console.log(`title:   ${draft.title}`)
  console.log(`excerpt: ${draft.excerpt}`)
  console.log(`tags:    ${draft.tags.join(', ')}`)
  console.log(`\n${draft.body}\n`)
  console.log('=== DE-AI REPORT ===')
  console.log(`before: ${fmtCounts(report.before)}`)
  console.log(`after:  ${fmtCounts(report.after)}`)
  console.log(report.rewriteNote)
}

export async function runWrite(argv: string[]): Promise<void> {
  const args = parseWriteArgs(argv)
  const cwd = process.cwd()
  loadDotenv({ path: resolve(cwd, '.env') })

  if (!args.project || !args.topic) {
    console.error('postdeck write: --project <id> and --topic "<topic>" are required')
    process.exit(1)
  }

  const config = await loadBlogsConfig(resolveConfigPath(cwd, args.config))
  const cfg = config.find((b) => b.id === args.project)
  if (!cfg) {
    console.error(`postdeck write: no project "${args.project}" in config. Available: ${config.map((b) => b.id).join(', ')}`)
    process.exit(1)
  }

  const llm = createAnthropicLLM({ env: (n) => process.env[n] })
  const deps = { fileStore: createLocalFs('/'), env: (n: string) => process.env[n], fetchImpl: fetch, llm }
  const source = resolveSource(cfg, deps)

  const toneContext = await gatherToneContext(source, cfg)
  const input: GenerateInput = { project: cfg.id, topic: args.topic, toneContext, lang: args.lang }

  if (args.dryRun) {
    const draft = await generateDraft(input, llm)
    const reviewed = await deAiReview(draft.body, llm)
    printDraftAndReport({ ...draft, body: reviewed.body }, reviewed.report)
    console.log('\n(dry-run: not saved)')
    return
  }

  const { ref, result } = await writeDraft(input, { llm, source })
  printDraftAndReport(result.draft, result.report)
  console.log(`\nsaved draft: ${ref.path ?? ref.url ?? ref.id}`)
}
```

- [ ] **Step 4: Branch `main()` to the `write` subcommand** in `apps/cli/src/main.ts`

Add the import near the top:

```ts
import { runWrite } from './write.js'
```

Insert at the very start of `main()` (before `const args = parseArgs(...)`):

```ts
  const argv0 = process.argv.slice(2)
  if (argv0[0] === 'write') {
    await runWrite(argv0.slice(1))
    return
  }
```

- [ ] **Step 5: Run test + full suite + typecheck**

Run: `pnpm vitest run apps/cli/src/write.test.ts`
Expected: PASS (3 tests).
Run: `pnpm test`
Expected: PASS — all tests green.
Run: `pnpm run typecheck`
Expected: clean (packages only; cli is checked by its own tooling/jiti at runtime).

- [ ] **Step 6: Commit**

```bash
git add apps/cli/src/write.ts apps/cli/src/write.test.ts apps/cli/src/main.ts
git commit -m "feat(cli): postdeck write — generate, De-AI review, save draft (--dry-run)"
```

---

## Task 11: End-to-end verification (live)

**Files:** none committed (uses the gitignored real `blogs.config.ts` + `.env`).

> This task exercises the real Anthropic API. It needs `ANTHROPIC_API_KEY` in the repo-root `.env` (or an `ant auth login` profile). Values are supplied at execution time and never committed.

- [ ] **Step 1: Confirm credentials**

Run: `ant auth status` (or check that `.env` has `ANTHROPIC_API_KEY`).
Expected: an active credential source. If none, add `ANTHROPIC_API_KEY=...` to the gitignored `.env`.

- [ ] **Step 2: Dry-run against a real file-based project** (freelance — markdown, real tone via `read()`)

Run: `node apps/cli/bin/postdeck.mjs write --project freelance --topic "How much to set aside for taxes as a new freelancer" --dry-run`
Expected (report what you observe): a DRAFT block (title/excerpt/tags/body) and a DE-AI REPORT with `before`/`after` counts where `after` counts are ≤ `before` (the rewrite reduced tics). No file written.

- [ ] **Step 3: Dry-run against the Notion project** (hongix — excerpt-fallback tone)

Run: `node apps/cli/bin/postdeck.mjs write --project hongix --topic "A short note on shipping side projects" --dry-run`
Expected: a draft renders (tone samples came from `list()` excerpts since notion `read()` is deferred). Confirm no crash from the excerpt fallback.

- [ ] **Step 4: Real save against freelance** (writes a draft file; safe — draft only)

Run: `node apps/cli/bin/postdeck.mjs write --project freelance --topic "A quick guide to quarterly tax instalments"`
Expected: prints `saved draft: .../content/guides/<slug>.md`. Verify the file exists with `status: draft` frontmatter and the reviewed body. (This writes into the freelance repo's working tree; it's a draft, not published. Remove it afterward if unwanted.)

- [ ] **Step 5: Error path — missing credentials message**

Temporarily run with credentials unavailable (e.g. `env -u ANTHROPIC_API_KEY` and no `.env` key / no `ant` profile) to confirm the failure surfaces a clear Anthropic auth error rather than a crash. Report the message.

- [ ] **Step 6: Full regression**

Run: `pnpm test`
Expected: PASS — all unit tests green.
Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 7: Update the progress ledger** (`.superpowers/sdd/progress.md`) noting Phase 3 tasks complete. (`.superpowers/` is gitignored — keep the ledger local; do not commit.)

---

## Self-Review

**Spec coverage (against `2026-08-21-phase3-l2-ai-pipeline-spec.md`):**
- §1.2 `LLMClient` port + `SourceDeps.llm?` → Task 2. ✓
- §1.3 De-AI linter (`deAiLint` + rule set incl. uniform-sentence-length) → Task 1. ✓
- §1.4 pipeline (`generateDraft`/`deAiReview`/`writeDraft`, defensive JSON parse, revised-body save, `slugify`, prompt builders) → Tasks 2–6. ✓
- §1.5 file `read()` (md/astro, `.md`/`.mdx`, notion deferred) → Task 7. ✓
- §1.6 `gatherToneContext` (body snippets + excerpt fallback) → Task 8. ✓
- §1.7 `createAnthropicLLM` (opus-4-8, adaptive thinking, effort high) → Task 9. ✓
- §1.8 `postdeck write --project/--topic/--lang/--dry-run` + report + `main()` subcommand → Task 10. ✓
- §4 testing: pure-core fakes, adapter read/tone, cli parse, regression → Tasks 1–10; live verify → Task 11. ✓
- §5 OSS: `@anthropic-ai/sdk` in adapters only, core stays pure, `.env.example` → Tasks 9. ✓

**Placeholder scan:** No "TBD"/"implement later"/vague steps; every code step shows full content. No forward references: pipeline shared types (`ToneContext`/`GenerateInput`/`Draft`) are created in Task 2 so Task 3 (prompts) and every later task import them from an existing module; Tasks 4–6 only append functions.

**Type consistency:** `LLMClient.complete(req: LLMRequest)` identical across Tasks 2, 4, 5, 9. `ToneContext`/`GenerateInput`/`Draft` defined in `pipeline.ts` (Task 2); `ReviewReport`/`WriteResult` added alongside their functions (Tasks 5–6). All consumed identically by prompts (Task 3), tone (Task 8), and CLI (Task 10). `deAiLint`/`LintFinding` shape identical in Tasks 1, 5. `read()` returns `PostBody { post, body }` in Task 7, consumed in Task 8. `writeDraft` saves `slugify(draft.title)` with the **revised** body — asserted in Task 6. `createDraft` input matches the existing `DraftInput` shape (slug/title/excerpt/tags/body/lang).

**Ordering:** core pure (1→6, fully testable with a fake LLM, no API key) → adapters read/tone/LLM (7→9) → CLI (10) → live verify (11). Task 3 depends on Task 4's types (noted); everything else is linear.
