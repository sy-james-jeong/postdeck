# Dashboard Publish Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Add a "발행" button to draft posts in the dashboard post list that flips draft→published via the L3 `publish()` seam (flip only; deploy stays CLI-only for safety).

**Architecture:** A server-only `publishPost` glue + a `'use server'` `publishAction` call the adapter `publish()`. A client `PublishButton` invokes the action and `router.refresh()`es on success. `PostList` renders the button only for `status === 'draft'` posts.

**Tech Stack:** Next.js 15 App Router (server actions + client components), React 19.

## Global Constraints
- **Flip only — the dashboard never deploys.** `publish()` (local/reversible) is the only action; `--deploy` (git push → live) stays CLI-only. Do not call deploy from the dashboard.
- **Do NOT run live Gemini or a real publish against the user's blogs during implementation.** Verify by `next build` + unit suite; the controller does an isolated sandbox manual test separately.
- `@postdeck/core` stays pure. `.js` import extensions (dashboard webpack extensionAlias). Additive: all 93 tests stay green. `/` read path otherwise unchanged except the new action column.

---

## File Structure
- Modify: `apps/dashboard/lib/write.ts` (add `publishPost`), `apps/dashboard/app/write/actions.ts` (add `publishAction`), `apps/dashboard/components/PostList.tsx` (action column), `apps/dashboard/app/globals.css` (`.btn-sm`).
- Create: `apps/dashboard/components/PublishButton.tsx`.

---

## Task 1: server glue + action

**Files:** Modify `apps/dashboard/lib/write.ts`, `apps/dashboard/app/write/actions.ts`.

**Interfaces:**
- Consumes: `resolveSource` (`@postdeck/core`), `createLocalFs`/`loadBlogsConfig`/`resolveConfigPath` (`@postdeck/adapters`), `Ref` type — all already imported/used in `write.ts`.
- Produces:
  - `publishPost(projectId: string, postId: string): Promise<Ref>` (lib/write.ts)
  - `publishAction(input: { projectId: string; postId: string }): Promise<{ ok: true; ref: Ref } | { ok: false; error: string }>` (actions.ts)

- [ ] **Step 1: Add `publishPost` to `apps/dashboard/lib/write.ts`** — append (it reuses the file's existing private `loadConfig()` + `envFn` and the imported `resolveSource`/`createLocalFs`/`Ref`):

```ts
export async function publishPost(projectId: string, postId: string): Promise<Ref> {
  const config = await loadConfig()
  const cfg = config.find((b) => b.id === projectId)
  if (!cfg) throw new Error(`no project "${projectId}" in config`)
  const source = resolveSource(cfg, { fileStore: createLocalFs('/'), env: envFn, fetchImpl: fetch })
  return source.publish(postId)
}
```

(If `write.ts` does not already import `resolveSource` from `@postdeck/core`, add it to that import; it already imports `Ref`, `createLocalFs`, `loadBlogsConfig`, `resolveConfigPath`. Verify `loadConfig`/`envFn` exist as file-local helpers — they do — and reuse them.)

- [ ] **Step 2: Add `publishAction` to `apps/dashboard/app/write/actions.ts`** — add the import and the action:

Add to the `../../lib/write.js` import: `publishPost`.

Append:

```ts
export async function publishAction(
  input: { projectId: string; postId: string },
): Promise<{ ok: true; ref: Ref } | { ok: false; error: string }> {
  try {
    const ref = await publishPost(input.projectId, input.postId)
    return { ok: true, ref }
  } catch (e) {
    return { ok: false, error: msg(e) }
  }
}
```

(`Ref` and `msg` are already imported/defined in `actions.ts`.)

- [ ] **Step 3: Typecheck + suite**

Run: `pnpm run typecheck`
Expected: clean.
Run: `pnpm test`
Expected: PASS — 93 (no new unit tests; glue is build+manual-verified).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/lib/write.ts apps/dashboard/app/write/actions.ts
git commit -m "feat(dashboard): publishPost glue + publishAction (flip draft->published)"
```

---

## Task 2: PublishButton + wire into PostList + styles

**Files:** Create `apps/dashboard/components/PublishButton.tsx`; modify `apps/dashboard/components/PostList.tsx`, `apps/dashboard/app/globals.css`.

**Interfaces:**
- Consumes: `publishAction` (`../app/write/actions.js`), `useRouter` (`next/navigation`).
- Produces: `PublishButton({ projectId, postId })`.

- [ ] **Step 1: Create `apps/dashboard/components/PublishButton.tsx`** (`'use client'`)

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { publishAction } from '../app/write/actions.js'

export function PublishButton({ projectId, postId }: { projectId: string; postId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const router = useRouter()

  const onClick = () => {
    setError('')
    start(async () => {
      const r = await publishAction({ projectId, postId })
      if (r.ok) {
        setDone(true)
        router.refresh()
      } else {
        setError(r.error)
      }
    })
  }

  if (done) return <span className="ok">발행됨 ✓</span>
  return (
    <>
      <button className="btn-sm" onClick={onClick} disabled={pending}>{pending ? '…' : '발행'}</button>
      {error && <span className="err"> {error}</span>}
    </>
  )
}
```

- [ ] **Step 2: Wire into `apps/dashboard/components/PostList.tsx`** — replace the file with:

```tsx
import type { ProjectView } from '@postdeck/adapters'
import { VariantBadges } from './VariantBadges.js'
import { PublishButton } from './PublishButton.js'

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—')

export function PostList({ project }: { project: ProjectView }) {
  if (project.error) return null
  return (
    <div>
      <h2>{project.name}</h2>
      <table>
        <thead><tr><th>제목</th><th>상태</th><th>발행일</th><th>언어</th><th></th></tr></thead>
        <tbody>
          {project.posts.map((post) => (
            <tr key={post.id}>
              <td>{post.liveUrl ? <a href={post.liveUrl} target="_blank" rel="noreferrer">{post.title}</a> : post.title}</td>
              <td><span className={`dot ${post.status}`} />{post.status}</td>
              <td>{fmt(post.publishDate)}</td>
              <td><VariantBadges variants={post.variants} /></td>
              <td>{post.status === 'draft' ? <PublishButton projectId={project.id} postId={post.id} /> : null}</td>
            </tr>
          ))}
          {project.posts.length === 0 && <tr><td colSpan={5} className="err">글 없음</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Add `.btn-sm` to `apps/dashboard/app/globals.css`** (append)

```css
.btn-sm { background:var(--pub); color:#04210b; border:0; border-radius:5px; padding:3px 10px; font-size:12px; font-weight:600; cursor:pointer; }
.btn-sm:disabled { opacity:.5; cursor:default; }
```

- [ ] **Step 4: Build-smoke + suite + typecheck (NO live publish/Gemini)**

Run: `pnpm --filter @postdeck/dashboard exec next build`
Expected: compiles + type-checks; `/` and `/write` routes present. If a real TS/JSX/import error appears (not a data/prerender error — pages are force-dynamic), STOP and report.
Run: `pnpm test` (93) and `pnpm run typecheck` (clean).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/components/PublishButton.tsx apps/dashboard/components/PostList.tsx apps/dashboard/app/globals.css
git commit -m "feat(dashboard): 발행 button on draft posts (flip via publishAction, router.refresh)"
```

---

## Self-Review
**Spec coverage:** `publishPost`/`publishAction` (§1.1–1.2) → Task 1. `PublishButton` + draft-only render + `router.refresh` (§1.3–1.4) → Task 2. Flip-only / no-deploy safety (§0) → enforced (no deploy call anywhere; `publishPost` calls only `source.publish`). Build+manual verify (§3) → Task 2 build + controller sandbox test. ✓
**Placeholder scan:** full code throughout.
**Type consistency:** `publishPost(projectId, postId): Promise<Ref>` matches `publishAction`'s call + the client's `publishAction({projectId, postId})`. `Ref` returned end-to-end. `PublishButton` props `{projectId, postId}` match `PostList`'s use (`project.id`, `post.id`). `source.publish(postId)` matches the L3 `BlogSource.publish(id): Promise<Ref>` seam.
