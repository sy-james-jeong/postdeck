# Gemini LLM Provider (default) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Google Gemini-backed `LLMClient` and make it the default provider for `postdeck write`, selectable via `POSTDECK_LLM`, without touching the core pipeline or the existing Anthropic adapter.

**Architecture:** A new `createGeminiLLM` adapter in `@postdeck/adapters` implements the existing core `LLMClient` port using `@google/genai`. A `selectLLM` helper picks Gemini (default) or Anthropic from `POSTDECK_LLM`. The CLI swaps its hardcoded `createAnthropicLLM` for `selectLLM`. Core stays pure; the pipeline is unchanged because the port is provider-agnostic.

**Tech Stack:** TypeScript (NodeNext, strict, `verbatimModuleSyntax`), pnpm workspace, Vitest, `@google/genai`, `@anthropic-ai/sdk` (existing), jiti, dotenv.

## Global Constraints

- **`@postdeck/core` stays pure** (zod-only runtime dep). `@google/genai` goes in `@postdeck/adapters` ONLY — never in core.
- **Provider default is Gemini:** `POSTDECK_LLM` unset ⇒ `gemini`. Values: `gemini` | `anthropic`; anything else throws a clear error.
- **Gemini model (verbatim):** `gemini-2.5-flash`.
- **System prompt is merged into `contents`** (`` `${system}\n\n${prompt}` ``) — do NOT use a `systemInstruction` field (avoids SDK-version shape dependence).
- **Gemini key:** `GEMINI_API_KEY`, falling back to `GOOGLE_API_KEY`.
- **Lazy client construction:** build the `GoogleGenAI` client inside `complete()`, not at factory-call time, so a missing/invalid-key error surfaces during the pipeline call (inside the CLI's try/catch → friendly message).
- **Import extensions:** `.js` (NodeNext), even from `.ts`.
- **Additive:** all 72 existing tests stay green; do not change core, the pipeline, or `createAnthropicLLM`.

---

## File Structure

**Created (`packages/adapters/src`):**
- `gemini-llm.ts` (+ `gemini-llm.test.ts`) — `createGeminiLLM`.
- `llm-select.ts` (+ `llm-select.test.ts`) — `selectLLM`.

**Modified:**
- `packages/adapters/src/index.ts` — export `createGeminiLLM`, `selectLLM`.
- `packages/adapters/package.json` — add `@google/genai`.
- `apps/cli/src/write.ts` — use `selectLLM` instead of `createAnthropicLLM`; provider-aware missing-credential message; broaden `isMissingCredentialError`.
- `apps/cli/src/write.test.ts` — add an `isMissingCredentialError` case for a Gemini-style message.
- `.env.example` — add `POSTDECK_LLM` + `GEMINI_API_KEY`.

---

## Task 1: `createGeminiLLM` adapter

**Files:**
- Create: `packages/adapters/src/gemini-llm.ts`, `packages/adapters/src/gemini-llm.test.ts`
- Modify: `packages/adapters/src/index.ts`, `packages/adapters/package.json`

**Interfaces:**
- Consumes: `LLMClient`, `LLMRequest` (`@postdeck/core`), `@google/genai`.
- Produces: `createGeminiLLM(deps: { env: (n: string) => string | undefined }): LLMClient`

- [ ] **Step 1: Add the dependency**

Run: `pnpm add @google/genai --filter @postdeck/adapters`
Expected: installs the SDK, updates `packages/adapters/package.json` + `pnpm-lock.yaml`.

- [ ] **Step 2: Write the failing test** (`packages/adapters/src/gemini-llm.test.ts`)

```ts
import { expect, test } from 'vitest'
import { createGeminiLLM } from './index.js'

test('createGeminiLLM returns an LLMClient with a complete() function', () => {
  // Lazy client construction means no network/SDK work happens here.
  const llm = createGeminiLLM({ env: (n) => (n === 'GEMINI_API_KEY' ? 'test-dummy' : undefined) })
  expect(typeof llm.complete).toBe('function')
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/adapters/src/gemini-llm.test.ts`
Expected: FAIL — `createGeminiLLM` not exported.

- [ ] **Step 4: Implement `packages/adapters/src/gemini-llm.ts`**

```ts
import { GoogleGenAI } from '@google/genai'
import type { LLMClient, LLMRequest } from '@postdeck/core'

// Edge adapter for the LLMClient port, backed by Google Gemini.
// The client is constructed lazily inside complete() so a missing/invalid-key
// error surfaces at call time (inside the CLI's try/catch), not at factory time.
// The system prompt is merged into `contents` rather than using a systemInstruction
// field, to avoid depending on SDK-version-specific request shapes.
export function createGeminiLLM(deps: { env: (n: string) => string | undefined }): LLMClient {
  const apiKey = deps.env('GEMINI_API_KEY') ?? deps.env('GOOGLE_API_KEY')
  return {
    async complete(req: LLMRequest): Promise<string> {
      const ai = new GoogleGenAI({ apiKey })
      const contents = req.system ? `${req.system}\n\n${req.prompt}` : req.prompt
      const res = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents })
      return res.text ?? ''
    },
  }
}
```

- [ ] **Step 5: Export from `packages/adapters/src/index.ts`** — add after the `createAnthropicLLM` export line:

```ts
export { createGeminiLLM } from './gemini-llm.js'
```

- [ ] **Step 6: Run test + typecheck**

Run: `pnpm vitest run packages/adapters/src/gemini-llm.test.ts`
Expected: PASS.
Run: `pnpm run typecheck`
Expected: clean. (If `tsc` errors on `res.text` or the `GoogleGenAI` options, STOP and report — do NOT add `as any`; the README confirms `response.text` is a property and `{ apiKey }` is a valid option, so a type error means an unexpected SDK shape worth surfacing.)

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/src/gemini-llm.ts packages/adapters/src/gemini-llm.test.ts packages/adapters/src/index.ts packages/adapters/package.json pnpm-lock.yaml
git commit -m "feat(adapters): createGeminiLLM (@google/genai, gemini-2.5-flash)"
```

---

## Task 2: `selectLLM` + CLI wiring

**Files:**
- Create: `packages/adapters/src/llm-select.ts`, `packages/adapters/src/llm-select.test.ts`
- Modify: `packages/adapters/src/index.ts`, `apps/cli/src/write.ts`, `apps/cli/src/write.test.ts`, `.env.example`

**Interfaces:**
- Consumes: `LLMClient` (`@postdeck/core`), `createGeminiLLM` (`./gemini-llm.js`), `createAnthropicLLM` (`./anthropic-llm.js`).
- Produces: `selectLLM(deps: { env: (n: string) => string | undefined }): LLMClient`

- [ ] **Step 1: Write the failing test** (`packages/adapters/src/llm-select.test.ts`)

```ts
import { expect, test } from 'vitest'
import { selectLLM } from './index.js'

// Dummy keys keep the underlying factories from caring about real credentials;
// selectLLM only needs to return the right client shape per POSTDECK_LLM.
const withEnv = (map: Record<string, string>) => ({ env: (n: string) => map[n] })

test('selectLLM defaults to gemini when POSTDECK_LLM is unset', () => {
  const llm = selectLLM(withEnv({ GEMINI_API_KEY: 'x' }))
  expect(typeof llm.complete).toBe('function')
})
test('selectLLM returns anthropic when POSTDECK_LLM=anthropic', () => {
  const llm = selectLLM(withEnv({ POSTDECK_LLM: 'anthropic', ANTHROPIC_API_KEY: 'x' }))
  expect(typeof llm.complete).toBe('function')
})
test('selectLLM throws on an unknown provider', () => {
  expect(() => selectLLM(withEnv({ POSTDECK_LLM: 'bogus' }))).toThrow(/POSTDECK_LLM/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/adapters/src/llm-select.test.ts`
Expected: FAIL — `selectLLM` not exported.

- [ ] **Step 3: Implement `packages/adapters/src/llm-select.ts`**

```ts
import type { LLMClient } from '@postdeck/core'
import { createGeminiLLM } from './gemini-llm.js'
import { createAnthropicLLM } from './anthropic-llm.js'

export function selectLLM(deps: { env: (n: string) => string | undefined }): LLMClient {
  const provider = deps.env('POSTDECK_LLM') ?? 'gemini'
  if (provider === 'gemini') return createGeminiLLM(deps)
  if (provider === 'anthropic') return createAnthropicLLM(deps)
  throw new Error(`POSTDECK_LLM must be "gemini" or "anthropic", got "${provider}"`)
}
```

- [ ] **Step 4: Export from `packages/adapters/src/index.ts`** — add:

```ts
export { selectLLM } from './llm-select.js'
```

- [ ] **Step 5: Run the selectLLM test to verify it passes**

Run: `pnpm vitest run packages/adapters/src/llm-select.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Rewire `apps/cli/src/write.ts`**

Change the `@postdeck/adapters` import line — replace `createAnthropicLLM` with `selectLLM`:

```ts
import { resolveConfigPath, loadBlogsConfig, createLocalFs, gatherToneContext, selectLLM } from '@postdeck/adapters'
```

Broaden `isMissingCredentialError` to also match Gemini-style messages (add `credential`):

```ts
export function isMissingCredentialError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /could not resolve authentication|authentication_error|x-api-key|api[\s_-]?key|credential/i.test(msg)
}
```

Replace the LLM construction line in `runWrite`:

```ts
  const llm = selectLLM({ env: (n) => process.env[n] })
```

Make the missing-credential message provider-aware (in the `catch` block):

```ts
    if (isMissingCredentialError(err)) {
      console.error(
        'postdeck write: no LLM credentials. Set GEMINI_API_KEY (default provider) or ANTHROPIC_API_KEY in .env — ' +
          'or set POSTDECK_LLM to pick a provider.',
      )
      process.exit(1)
    }
```

Leave everything else in `write.ts` unchanged.

- [ ] **Step 7: Add a Gemini-message case to `apps/cli/src/write.test.ts`** (append)

```ts
test('isMissingCredentialError detects a Gemini-style key error', () => {
  expect(isMissingCredentialError(new Error('API key not valid. Please pass a valid API key.'))).toBe(true)
})
```

(Ensure `isMissingCredentialError` is imported in `write.test.ts` — it is already imported by the existing credential test added in the previous phase; if not, add it to the import from `./write.js`.)

- [ ] **Step 8: Update `.env.example`** — replace the existing L2 block (the `# L2 AI writing...` comment + `ANTHROPIC_API_KEY` line) with:

```
# L2 AI writing (postdeck write). Provider: "gemini" (default, cheapest) or "anthropic".
POSTDECK_LLM=gemini
# Gemini key (default provider) — get one at aistudio.google.com.
GEMINI_API_KEY=...
# Anthropic key (used only when POSTDECK_LLM=anthropic). Or `ant auth login`.
ANTHROPIC_API_KEY=sk-ant-xxx
```

- [ ] **Step 9: Run full suite + typecheck**

Run: `pnpm test`
Expected: PASS — all prior tests green plus the new selectLLM (3) and Gemini-message (1) tests.
Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add packages/adapters/src/llm-select.ts packages/adapters/src/llm-select.test.ts packages/adapters/src/index.ts apps/cli/src/write.ts apps/cli/src/write.test.ts .env.example
git commit -m "feat(cli): selectLLM (POSTDECK_LLM, default gemini); provider-aware credential error"
```

---

## Task 3: End-to-end verification

**Files:** none committed.

- [ ] **Step 1: Keyless wiring check (default provider = gemini)**

With no `GEMINI_API_KEY`/`GOOGLE_API_KEY`/`ANTHROPIC_API_KEY` and no `POSTDECK_LLM` set, run:

Run: `node apps/cli/bin/postdeck.mjs write --project freelance --topic "A quick note on quarterly taxes" --dry-run`
Expected: the CLI runs config load → `resolveSource` → `gatherToneContext` (real `read()` on freelance markdown) → prompt build → into the Gemini `complete()` call, then fails at the missing-key path and prints the friendly one-line message:
`postdeck write: no LLM credentials. Set GEMINI_API_KEY (default provider) or ANTHROPIC_API_KEY in .env — or set POSTDECK_LLM to pick a provider.`
No raw stack trace. If the Gemini SDK's actual missing-key message is NOT caught by `isMissingCredentialError` (raw stack appears instead), note the exact message and broaden the regex, then re-run.

- [ ] **Step 2: Provider switch check (still keyless)**

Run: `POSTDECK_LLM=anthropic node apps/cli/bin/postdeck.mjs write --project freelance --topic "x" --dry-run`
Expected: same friendly missing-credential message (now via the Anthropic path) — confirms `selectLLM` switches providers.

Run: `POSTDECK_LLM=bogus node apps/cli/bin/postdeck.mjs write --project freelance --topic "x" --dry-run`
Expected: a clear `POSTDECK_LLM must be "gemini" or "anthropic"...` error.

- [ ] **Step 3: Live generation (only if a GEMINI_API_KEY is available)**

If a real key exists, add it to the gitignored repo-root `.env` (`GEMINI_API_KEY=...`), then:

Run: `node apps/cli/bin/postdeck.mjs write --project freelance --topic "How much to set aside for taxes as a new freelancer" --dry-run`
Expected: a DRAFT block (title/excerpt/tags/body from Gemini) and a DE-AI REPORT with `before`/`after` counts (after ≤ before). No save. If no key is available, record live generation as still-pending and rely on Steps 1–2 for wiring confidence.

- [ ] **Step 4: Full regression**

Run: `pnpm test`
Expected: PASS.
Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 5: Update the progress ledger** (`.superpowers/sdd/progress.md`) noting the Gemini-provider tasks complete and whether live generation was verified. (`.superpowers/` is gitignored — keep local, do not commit.)

---

## Self-Review

**Spec coverage (against `2026-09-14-gemini-provider-spec.md`):**
- §1.1 `createGeminiLLM` (`@google/genai`, `gemini-2.5-flash`, system merged into contents, `GEMINI_API_KEY`→`GOOGLE_API_KEY`) → Task 1. ✓ (lazy construction added for clean error handling — consistent with §0.1-3 intent.)
- §1.2 `selectLLM` (`POSTDECK_LLM` default gemini; anthropic; unknown→throw) → Task 2. ✓
- §1.3 CLI uses `selectLLM`; provider-aware message; `isMissingCredentialError` broadened → Task 2. ✓
- §1.4 `.env.example` gains `POSTDECK_LLM` + `GEMINI_API_KEY` → Task 2. ✓
- §2 core/pipeline/anthropic unchanged; SDK in adapters only → enforced by Global Constraints + task scoping. ✓
- §4 tests (gemini smoke, selectLLM branches, gemini-message credential, regression) → Tasks 1–2; live/wiring verify → Task 3. ✓

**Placeholder scan:** No "TBD"/vague steps; every code step is complete. The `res.text ?? ''` and `{ apiKey }` usages are confirmed against the official `@google/genai` README; Step 6 tells the implementer to stop-and-report rather than paper over an unexpected type error.

**Type consistency:** `createGeminiLLM(deps: { env })` / `createAnthropicLLM(deps: { env })` / `selectLLM(deps: { env })` all take the same `{ env: (n: string) => string | undefined }` shape and return `LLMClient`. `selectLLM` calls both factories with the same `deps`. `write.ts` builds `deps.env` as `(n) => process.env[n]` and passes `{ env }` to `selectLLM` — matches. `isMissingCredentialError` signature unchanged (only the regex broadened).

**Ordering:** Task 1 (gemini adapter, standalone) → Task 2 (selectLLM depends on both adapters; CLI depends on selectLLM) → Task 3 (verify). Linear, no forward refs.
