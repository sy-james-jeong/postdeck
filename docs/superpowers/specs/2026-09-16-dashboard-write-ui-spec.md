# PostDeck — Spec: Dashboard Write UI (L2 in the browser)

- **작성일**: 2026-09-16
- **상태**: 설계 확정(자율 진행 — 사용자가 "묻지말고 진행" 위임) → plan → 실행.
- **목적**: 이미 만든 L2 파이프라인(`writeDraft`/`generateDraft`/`deAiReview`)을 대시보드에서 쓴다. 주제 입력 → 생성 → De-AI 리포트 확인 → draft 저장. CLI가 아닌 매일 쓰는 UI에서.
- **선행**: Phase 2 대시보드(L1), Phase 3 L2(`postdeck write`), Gemini provider.

## 0. 결정 (자율)

1. **새 라우트 `/write`** (읽기 전용 `/`는 그대로). 서버 컴포넌트 페이지가 쓰기 가능한 프로젝트 목록을 읽어 클라이언트 폼에 넘김.
2. **Server Actions** (Next 15 기본). `generateAction`/`saveAction`가 서버에서 파이프라인 실행(키·fs 서버측 유지) → 결과 반환. 에러는 잡아서 `{ ok:false, error }`.
3. **생성/저장 분리** (CLI dry-run→save와 동일): generate는 `generateDraft`+`deAiReview`만(저장 X, 리뷰된 draft 반환) → 사람이 확인 → save는 그 리뷰된 draft를 `createDraft`로 저장(재생성 X, LLM 비용 1회). 
4. **테스트 가능성**: `generateForProject`/`saveDraftForProject`는 선택적 `deps` 파라미터를 받아(기본은 실 deps 구성) fake LLM/source로 단위 테스트. 순수 헬퍼(`projectOptions`, De-AI 리포트 포맷)는 vitest.
5. **마크다운 렌더**: v1은 본문을 `<pre>` 프리포맷으로(정식 마크다운 렌더는 YAGNI).
6. **비용**: 생성은 사용자가 버튼 눌러야 발생(자동 호출 없음). 검증 중 실제 Gemini 호출 안 함(빌드+단위테스트로).

## 1. 범위

### 1.1 서버 로직 (`apps/dashboard/lib/write.ts`, server-only)

```ts
interface WritableProject { id: string; name: string }
listWritableProjects(): Promise<WritableProject[]>   // loadBlogsConfig → {id, name: name??id}

interface GenerateResult { draft: Draft; report: ReviewReport }
generateForProject(projectId: string, topic: string, lang?: string, deps?: WriteDeps): Promise<GenerateResult>
saveDraftForProject(projectId: string, draft: Draft, lang?: string, deps?: WriteDeps): Promise<Ref>
```
- `WriteDeps = { llm: LLMClient; source: BlogSource }` (선택). 미지정 시 config 로드 → `selectLLM`/`createLocalFs('/')`/`resolveSource`로 구성, tone은 `gatherToneContext`.
- `generateForProject`: (deps 없으면) config에서 project 찾고 deps 구성 → `gatherToneContext` → `generateDraft` → `deAiReview` → `{ draft: {…, body: reviewed.body}, report }`.
- `saveDraftForProject`: source로 `createDraft({ slug: slugify(draft.title), title, excerpt, tags, body, lang })` → `Ref`.
- project id 없으면 명확한 throw.

### 1.2 Server Actions (`apps/dashboard/app/write/actions.ts`, `'use server'`)

```ts
generateAction(input: { projectId: string; topic: string; lang?: string }): Promise<{ ok: true; result: GenerateResult } | { ok: false; error: string }>
saveAction(input: { projectId: string; draft: Draft; lang?: string }): Promise<{ ok: true; ref: Ref } | { ok: false; error: string }>
```
- try/catch로 파이프라인 에러(자격증명/API/검증) → `{ ok:false, error: message }`. 클라이언트가 표시.

### 1.3 페이지 + 폼

- `apps/dashboard/app/write/page.tsx` (서버 컴포넌트, `force-dynamic`): `listWritableProjects()` → `<WriteForm projects={...} />`.
- `apps/dashboard/components/WriteForm.tsx` (`'use client'`): project select + topic textarea + lang(선택) input + Generate 버튼(로딩 상태). 결과: draft(title/excerpt/tags/body `<pre>`) + De-AI 리포트(before/after 카운트). Save 버튼 → saveAction → "saved: <ref>" 표시. 에러 배너.
- `/` 와 `/write` 상호 내비 링크(헤더).

### 1.4 순수 헬퍼 (테스트)

- `apps/dashboard/lib/write-format.ts`: `deAiSummary(report): string` (예: `connectors 4→1, emoji 3→0` / `clean`). 순수, 테스트.
- `projectOptions(config): WritableProject[]` — `listWritableProjects` 내부에서 사용, 순수 부분 테스트.

## 2. 비목표

- 마크다운 리치 렌더/프리뷰; 이미지; 다국어 동시 생성; 발행(L3); 스트리밍 생성; 편집 후 재검토 루프. 전부 이후.

## 3. 테스트

- 순수: `deAiSummary`, `projectOptions`.
- `generateForProject`/`saveDraftForProject`: fake `deps`(fake LLM 스크립트 응답 + fake BlogSource)로 — generate가 리뷰된 body 반환, save가 slugify된 slug + 리뷰 body로 createDraft 호출.
- 회귀: 기존 80 그대로. 대시보드 빌드(`next build`) 컴파일·타입 통과(라이브 생성 호출 안 함).
- 라이브 UI 생성은 이미 CLI로 증명됨 → 대시보드에선 빌드/유닛까지.

## 4. 실행 순서 (plan 입력)

1. **순수 헬퍼** `write-format.ts`(`deAiSummary`) + `projectOptions` + 테스트.
2. **`lib/write.ts`** `listWritableProjects`/`generateForProject`/`saveDraftForProject`(선택 deps) + fake-deps 테스트.
3. **Server actions** `app/write/actions.ts` + **`WriteForm`** 클라이언트 컴포넌트 + **`app/write/page.tsx`** + `/`↔`/write` 내비. `next build` 스모크(라이브 생성 X).
4. 회귀(80+신규) + 빌드 검증.
