# PostDeck — Phase 3 Spec: L2 AI Writing + De-AI Review + `postdeck write`

- **작성일**: 2026-08-21
- **상태**: 설계 확정 → writing-plans 대기
- **이 문서의 목적**: 주제 → AI 초안 생성 → De-AI 2-패스 검토 → 소스에 draft 저장, 그리고 `postdeck write` CLI. 브레인스토밍 확정 결정이 §0.1에 있음.
- **선행 문서**: `docs/superpowers/specs/2026-08-16-postdeck-design.md` (전체 설계 §8), `docs/superpowers/specs/2026-08-16-phase2-dashboard-cli-spec.md` (Phase 2).

---

## 0. 현재 상태 (Phase 2 완료분 — 이미 있는 것)

`main`에 병합됨 (merge `19fb8a8`). 48 테스트 통과, `pnpm run typecheck` 클린. `postdeck` CLI가 `blogs.config.ts`를 로드해 대시보드를 부팅. 실블로그 3개(reamly/freelance/hongix) 연결 검증됨.

**L2가 소비/확장할 표면:**
- `@postdeck/core`: `Post`/`DraftInput`/`Ref`/`PostBody` 모델, `FileStore`/`BlogSource` 포트, 어댑터 레지스트리, zod config. **순수 (zod만 런타임 의존).**
- `@postdeck/adapters`: `createLocalFs`, `loadBlogsConfig`/`resolveConfigPath`, `loadPosts`/`loadProjects`, markdown/astro/notion 어댑터.
- **`createDraft`는 이미 3어댑터 다 구현됨** (round-trip 안전, `raw` 보존). L2는 이걸 그대로 소비.
- **`read()`는 3어댑터 다 `throw 'not implemented until L2'`.** L2에서 file 어댑터(markdown/astro)만 구현. notion은 계속 미룸.

**`DraftInput` 모양** (파이프라인 산출물이 매핑할 것):
```ts
interface DraftInput { slug: string; title: string; excerpt: string; date?: Date; tags?: string[]; body: string; lang?: string; extraFields?: Record<string, unknown> }
```

### 0.1 브레인스토밍 확정 결정 (2026-08-21)

1. **LLM은 주입 포트.** `@postdeck/core`는 순수 유지 — `LLMClient` 포트만 정의(SDK 의존 0). 실제 Anthropic 구현은 `@postdeck/adapters`가 제공하고 엣지에서 주입 (`FileStore`/`fetchImpl`와 동일 패턴).
2. **파이프라인·린터는 core에 순수하게.** generate/review/writeDraft 오케스트레이션과 De-AI 규칙 린터, 프롬프트 빌더, slugify는 core(순수). LLM이 주입이라 fake로 완전 테스트 가능.
3. **진입면은 CLI 하나** — `postdeck write`. 대시보드 쓰기 UI는 다음 Phase(비목표).
4. **톤 컨텍스트 = 기존 글 본문.** file 어댑터 `read()`(markdown/astro)를 지금 구현해 기존 글 본문을 few-shot 톤 샘플로. notion `read()`는 계속 미룸 → hongix는 `list()` excerpt 폴백.
5. **draft만 저장, 발행은 사람.** 자동 발행 없음 (L3).
6. **모델**: `claude-opus-4-8`, adaptive thinking, effort high, `@anthropic-ai/sdk`. 키는 gitignore된 `.env`의 `ANTHROPIC_API_KEY` 또는 `ant auth login` 프로필.

---

## 1. 범위 (L2 AI 작성/검토 + CLI)

목표: **주제 하나로 프로젝트 톤에 맞는 초안을 생성하고, AI스러운 티를 걷어낸 뒤, 그 프로젝트 규약대로 draft로 저장한다.**

### 1.1 패키지 경계

```
packages/core/       # (순수) + LLMClient 포트, De-AI 린터, 프롬프트 빌더, slugify,
                     #   generateDraft / deAiReview / writeDraft 오케스트레이션
packages/adapters/   # + markdown/astro read(), createAnthropicLLM (LLMClient 구현),
                     #   gatherToneContext (read() 톤 + excerpt 폴백)
apps/cli/            # + `postdeck write` 명령
```

의존 방향 불변: `apps`, `adapters` → `core`. core는 SDK를 모른다 (포트만).

### 1.2 `LLMClient` 포트 (core)

```ts
export interface LLMRequest { system?: string; prompt: string }
export interface LLMClient { complete(req: LLMRequest): Promise<string> }
```

- 텍스트 in / 텍스트 out. 구조화는 파이프라인이 프롬프트로 지시하고 방어적으로 파싱(§1.4). 포트를 얇게 유지해 fake 테스트가 쉽다.
- `SourceDeps`에 `llm?: LLMClient`를 추가(선택). 파이프라인은 `deps.llm`을 요구.

### 1.3 De-AI 규칙 린터 (core, 순수)

```ts
export interface LintFinding { id: string; label: string; matches: string[]; count: number }
export function deAiLint(text: string): LintFinding[]
```

v1 규칙 (설계 §8, 데이터 주도 목록):
- **overused-connectors**: however, moreover, furthermore, additionally, thus (대소문자 무시, 단어 경계).
- **cliche-phrases**: "in conclusion", "it's worth noting", "that said", "at the end of the day", "when it comes to".
- **em-dash-overuse**: em-dash(`—`) 밀도가 문장당 임계 초과.
- **uniform-sentence-length**: 문장 길이 분산이 낮음(균일) 플래그.
- **listicle-padding**: "Here are N …", "Let's dive in", "In this article".
- **emoji**: 이모지 존재.

각 규칙은 `{ id, label, test(text) → matches[] }` 데이터로 선언 → `deAiLint`가 순회. fixture 테스트: 나쁜 샘플에서 발화, 깨끗한 샘플에서 0.

### 1.4 파이프라인 (core, 순수 — LLM 주입)

```ts
export interface GenerateInput { project: string; topic: string; toneContext: ToneContext; lang?: string }
export interface ToneContext { projectName: string; samples: { title: string; snippet: string }[] }  // snippet = 본문 또는 excerpt
export interface Draft { title: string; excerpt: string; tags: string[]; body: string }
export interface ReviewReport { before: LintFinding[]; after: LintFinding[]; rewriteNote: string }
export interface WriteResult { draft: Draft; report: ReviewReport }

export function generateDraft(input: GenerateInput, llm: LLMClient): Promise<Draft>
export function deAiReview(body: string, llm: LLMClient): Promise<{ body: string; report: ReviewReport }>
export function writeDraft(input: GenerateInput, deps: { llm: LLMClient; source: BlogSource }): Promise<{ ref: Ref; result: WriteResult }>
export function slugify(title: string): string
```

**2-패스 데이터 흐름:**
1. **generate**: 프롬프트(주제 + 톤 few-shot + 프로젝트명) → `llm.complete` → JSON `{title, excerpt, tags, body}`를 방어적으로 파싱(코드펜스 허용, 실패 시 명확한 에러).
2. **De-AI review**: (a) `deAiLint(body)` → before; (b) **rewrite 패스**: 프롬프트(body + before 지적) → `llm.complete` → 사람 톤 body; (c) `deAiLint(rewritten)` → after. `report = { before, after, rewriteNote }`.
3. **save** (`writeDraft`): `source.createDraft({ slug: slugify(draft.title), title, excerpt, body: revisedBody, tags, lang })` → `Ref`. **draft만.**

프롬프트 빌더(`buildGeneratePrompt`, `buildRewritePrompt`)는 순수 함수로 분리해 테스트.

### 1.5 file 어댑터 `read()` (adapters)

- **markdown `read(id)`**: `id`=slug. `${dir}/${slug}.md` 읽어 `parseFrontmatter` → `toPost` + body. `{ post, body }` 반환.
- **astro `read(id)`**: `id`=`lang/slug`. `${dir}/${lang}/${slug}.md` 또는 `.mdx` → `parseFrontmatter` → Post + body.
- **notion `read()`**: **계속 `throw 'not implemented'`** (blocks→markdown 미룸).

### 1.6 `gatherToneContext` (adapters)

```ts
export function gatherToneContext(source: BlogSource, cfg: BlogConfig, opts?: { max?: number }): Promise<ToneContext>
```
- `source.list()`에서 최근 published 글 상위 N(기본 3) 선택.
- 각 글에 `read()` 시도 → 본문 앞부분을 snippet으로. `read()`가 not-implemented면(notion) `excerpt`로 폴백.
- `projectName = cfg.name ?? cfg.id`.

### 1.7 `createAnthropicLLM` (adapters)

```ts
export function createAnthropicLLM(deps: { env: (n: string) => string | undefined }): LLMClient
```
- `@anthropic-ai/sdk`. `ANTHROPIC_API_KEY` 있으면 그걸로, 없으면 zero-arg 클라이언트(`ant` 프로필 자동 인식).
- `complete(req)`: `client.messages.create({ model: 'claude-opus-4-8', max_tokens: 16000, thinking: { type: 'adaptive' }, output_config: { effort: 'high' }, system: req.system, messages: [{ role: 'user', content: req.prompt }] })` → text 블록들을 이어 반환.
- 자격증명 전무면 명확한 에러 (사용법 안내).

### 1.8 `postdeck write` CLI (apps/cli)

`postdeck write --project <id> --topic "<topic>" [--lang <lang>] [--dry-run]`
- `.env`(dotenv) 로드 → `loadBlogsConfig` → project id 해석(없으면 명확한 에러).
- deps: `createLocalFs('/')`, `env`, `createAnthropicLLM({env})`.
- `gatherToneContext` → `writeDraft` 실행.
- **`--dry-run`**: 초안 + De-AI 리포트만 터미널 출력, 저장 안 함. 기본: 저장 후 `Ref` + 리포트 출력.
- 리포트 출력: before/after 규칙별 count (예: `connectors 4→1, em-dash 6→2, emoji 3→0`).
- `parseWriteArgs`는 순수 함수로 분리(테스트).

---

## 2. 비목표 (v1 L2 — 이음새만)

- **대시보드 쓰기 UI**: 다음 Phase. (`writeDraft`는 순수라 나중에 server action으로 그대로 재사용.)
- **notion `read()`**: hongix 톤은 excerpt 폴백. blocks→markdown은 이후.
- **자동 발행 / 재빌드 훅**: L3.
- **스트리밍 생성 UI, 다국어 동시 생성, 배치**: 미룸.
- **슬러그 충돌 처리**: v1은 `slugify(title)` 그대로 — 동일 슬러그면 createDraft가 덮어씀(문서화). 회피 로직은 이후.

---

## 3. 아키텍처 배치 (Phase 3 산출물)

```
packages/core/src/
  llm.ts            # LLMClient 포트 + LLMRequest
  fake-llm.ts (test-only helper 가능) 또는 테스트 파일 내 fake
  deai.ts           # deAiLint + 규칙 목록
  prompts.ts        # buildGeneratePrompt / buildRewritePrompt
  pipeline.ts       # generateDraft / deAiReview / writeDraft / slugify (또는 slug.ts 분리)
packages/adapters/src/
  markdown.ts, astro-collection.ts  # read() 구현
  anthropic-llm.ts  # createAnthropicLLM
  tone.ts           # gatherToneContext
apps/cli/src/
  write.ts          # parseWriteArgs + runWrite
  main.ts           # `write` 서브커맨드 분기
```

`SourceDeps`에 `llm?: LLMClient` 추가 (core/source.ts). 기존 소비자 무영향.

---

## 4. 테스트 전략

- **core (순수, fake `LLMClient`)**:
  - `deAiLint`: 각 규칙 fixture — 나쁜 샘플 발화, 깨끗한 샘플 0.
  - `generateDraft`: fake가 뱉은 JSON을 `Draft`로 파싱(코드펜스·여분 텍스트 방어). 파싱 실패 시 에러.
  - `deAiReview`: lint→rewrite(fake)→lint, `report` shape·count 정확.
  - `writeDraft`: fake source의 `createDraft`가 **revised body**로 호출됨을 assert (원본 body 아님), `Ref` 반환.
  - `slugify`, 프롬프트 빌더(톤·프로젝트 메타 포함) 경량 테스트.
- **adapters**:
  - markdown/astro `read()` round-trip: fixture 파일 → 올바른 Post + body (astro `.md`/`.mdx` 둘 다). notion `read()`는 여전히 throw 확인.
  - `gatherToneContext`: file 소스는 본문 snippet, notion(read throw) 소스는 excerpt 폴백.
  - `createAnthropicLLM`: 자격증명 전무 시 명확한 에러 (실제 API 호출은 수동 검증).
- **cli**: `parseWriteArgs` 단위 테스트. 실제 생성은 Task-N 라이브 검증.
- **회귀**: 기존 48 테스트 전부 green.

---

## 5. OSS-readiness

- `.env.example`에 `ANTHROPIC_API_KEY` 추가.
- 새 런타임 의존은 `@anthropic-ai/sdk`(adapters만). core는 순수 유지(zod).
- 실 API 키/생성물은 커밋 금지 (기존 gitignore가 커버).

---

## 6. Phase 4 예고 (이번 아님)

- 대시보드 쓰기 UI (생성 폼 + 스트리밍 + 리포트 뷰 + 저장) — `writeDraft` 재사용.
- notion `read()` (blocks→markdown) → hongix 톤 본문화 + 상세 뷰.
- L3: 발행 오케스트레이션 + 재빌드 훅.

---

## 7. 실행 순서 (writing-plans 입력) — 순수 코어 먼저, 엣지·CLI·검증 뒤

1. **De-AI 린터** `deAiLint` + 규칙 목록 (core, 순수). fixture 테스트.
2. **`LLMClient` 포트 + fake + `slugify`** (core). `SourceDeps.llm?` 추가.
3. **프롬프트 빌더** `buildGeneratePrompt`/`buildRewritePrompt` (core, 순수).
4. **`generateDraft`** (core) — fake LLM → Draft 파싱.
5. **`deAiReview`** (core) — lint→rewrite→lint 리포트.
6. **`writeDraft` 오케스트레이터** (core) — generate+review→`createDraft`(fake source). **여기서 moat 완성·전부 fake로 green.**
7. **file 어댑터 `read()`** (markdown+astro, `.md`/`.mdx`). round-trip 테스트.
8. **`gatherToneContext`** (adapters) — read() 톤 + notion excerpt 폴백.
9. **`createAnthropicLLM`** (adapters, `@anthropic-ai/sdk`).
10. **`postdeck write` CLI** (apps/cli) — 배선 + `--dry-run` + 리포트 출력.
11. **e2e 검증** — 실 프로젝트 상대로 `postdeck write --dry-run` → 초안·리포트 확인 → 실제 저장(draft)까지. `ANTHROPIC_API_KEY` 없으면 명확한 에러 확인.

핵심: 순수 파이프라인(4·5·6)은 `toneContext`를 직접 주입하니 read()(7) 없이 완성·green. 실제 API 호출(9)은 11에서만 돈다.
