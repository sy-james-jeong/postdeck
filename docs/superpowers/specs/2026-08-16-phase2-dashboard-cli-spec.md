# PostDeck — Phase 2 Spec: Dashboard (L1) + CLI

- **작성일**: 2026-08-16 (브레인스토밍으로 결정 확정 후 개정)
- **상태**: 설계 확정 → writing-plans 대기
- **이 문서의 목적**: L1 읽기 대시보드 + `npx` CLI를 짓기 위한 확정 명세. 브레인스토밍에서 정한 결정들이 §0.1에 박혀 있음.
- **선행 문서**: `docs/superpowers/specs/2026-08-16-postdeck-design.md` (전체 설계), `docs/superpowers/plans/2026-08-16-postdeck-core-adapters.md` (Plan 1).

---

## 0. 현재 상태 (Plan 1 완료분 — 이미 있는 것)

`main`에 병합됨. 28 테스트 통과, `pnpm run typecheck` 클린.

**패키지:**
- `@postdeck/core` — 순수 도메인 (zod만 런타임 의존). Post 모델, 직렬화 config, status 정규화, 다국어 그룹핑, `BlogSource`/`FileStore` 인터페이스, 어댑터 레지스트리.
- `@postdeck/adapters` — round-trip 안전 frontmatter, `localFs` FileStore, `markdown`/`astro-collection`/`notion` 어댑터, `loadPosts` 엔진.

**이미 쓸 수 있는 엔진 API 표면** (Phase 2가 소비할 것):
```ts
// @postdeck/adapters
loadPosts(config: BlogsConfig, deps: SourceDeps, now?: Date): Promise<Record<string, Post[]>>
createLocalFs(rootDir: string): FileStore

// @postdeck/core
defineBlogs(list: BlogConfig[]): BlogsConfig
notionSource({databaseId, tokenRef}) / markdownSource({dir}) / astroCollectionSource({dir, langs})
// SourceDeps = { fileStore?: FileStore; env: (name)=>string|undefined; fetchImpl?: typeof fetch }
```

**Post 모양** (대시보드가 렌더할 것): `{ id, project, title, slug, status: 'draft'|'scheduled'|'published', publishDate: Date|null, updatedDate?, excerpt, tags[], author?, liveUrl?, variants?: [{lang,status,publishDate,present}], raw }`

**어댑터 capabilities**: 각 `BlogSource`는 `{ canWrite, enforcesFutureDates, supportsTranslations }`를 선언. 현재 3개 다 `enforcesFutureDates:false`.

### 0.1 브레인스토밍 확정 결정 (2026-08-16)

이 명세를 관통하는 확정 사항:

1. **L1은 메타데이터만.** 글 본문 상세 뷰는 넣지 않는다 → 어댑터 `read()` 구현은 이번 Phase에서 하지 않고 L2/Phase 3로 미룬다. 대시보드는 `list()`만 소비.
2. **엔진 확장은 additive.** 기존 `loadPosts`와 그 테스트는 손대지 않는다. per-project 메타를 노출하는 `loadProjects`를 **새로** 추가한다 (§1.1).
3. **등록 블로그 3개**: `reamly`(astro-collection), `freelance`(markdown), `hongix`(**notion**). `ripeledger`는 블로그가 붙으면 그때 config 한 줄 추가.
4. **hongix = Notion.** 로컬 마크다운 미러(`hongix-site/src/blog/posts`)는 비어 있고 콘텐츠는 Notion으로 이전됨. `NOTION_TOKEN`/`NOTION_DB`(env)로 실 Notion을 읽는다.
5. **CLI 부팅**: `apps/cli`가 `blogs.config.ts`(TS)를 jiti로 로드·검증 → `POSTDECK_CONFIG` env 세팅 → dashboard의 `next dev`를 spawn + 브라우저 오픈.
6. **단일 공개 레포 + config는 gitignore.** 이 레포 = 공개 OSS 툴(core/adapters/dashboard/cli), 실데이터 0. 진짜 `blogs.config.ts`와 `.env`는 gitignore로 로컬 working tree에만 두고, `blogs.config.example.ts`/`.env.example`만 커밋한다 (§4).

---

## 1. Phase 2 범위 (L1 대시보드 + CLI)

목표: **여러 프로젝트·여러 소스의 블로그 현황을 한 화면에서 읽는다** + `npx`로 로컬 부팅.

### 1.1 엔진 확장 — `loadProjects` (per-project capabilities 노출)

`loadPosts`는 현재 `Record<string, Post[]>`만 반환하고 per-project capabilities를 노출하지 않음. 대시보드가 "예약(빌드 미반영)" 정직 표기를 하려면 각 프로젝트의 `enforcesFutureDates`를 알아야 함.

**첫 태스크**: `@postdeck/adapters`에 `loadProjects`를 **additive**로 추가.

```ts
loadProjects(config: BlogsConfig, deps: SourceDeps, now?: Date): Promise<ProjectView[]>

interface ProjectView {
  id: string
  name: string                       // cfg.name ?? cfg.id
  liveUrl?: string
  sourceType: 'notion' | 'markdown' | 'astro-collection'
  capabilities: SourceCapabilities   // ← enforcesFutureDates 등을 대시보드에 전달
  posts: Post[]
  counts: { draft: number; scheduled: number; published: number }
  error?: string                     // per-project 실패 격리 (아래)
}
```

**per-project 에러 격리 (필수):** 각 프로젝트를 개별 `try/catch`로 로드한다. Notion 토큰 누락, 디렉토리 부재 등 한 소스가 실패해도 **전체 보드가 죽지 않고** 해당 카드만 `error`가 채워지고 `posts:[]`, `counts` 0으로 렌더된다. `capabilities`는 resolved `BlogSource`에서 그대로 가져온다.

**`loadPosts`는 그대로 유지** (28 테스트 보호). `loadProjects`는 별도 구현이며, 내부 posts 로딩 로직(`resolveSource` → `list` → `toPost` → 필요 시 `groupTranslations`)을 공유 헬퍼로 추출해 두 함수가 재사용할 수 있으면 좋다(리팩터는 기존 테스트가 그대로 통과하는 선에서만).

### 1.2 대시보드 (Next.js App Router)

- **스택**: Next.js App Router. 서버 컴포넌트/route handler에서 `loadProjects`를 호출(파일·git·Notion 토큰은 서버측). React UI. 클라이언트측 데이터 페칭 없음.
- **읽기 전용** (쓰기·발행은 Phase 3/L3). 최신 Claude 모델 관련 없음 (순수 읽기 UI).
- **뷰 (한 페이지 `/`에 3종):**
  - **프로젝트별 카드**: 이름 + "발행 N · 예약 M · 초안 K" 카운트. `capabilities.enforcesFutureDates === false`인 소스는 예약 카운트에 **"예약(빌드 미반영)"** 뱃지. `error`가 있는 프로젝트는 카드에 에러 상태를 인라인 표기(카운트 대신).
  - **캘린더/타임라인 뷰**: 전 프로젝트 통합, `publishDate` 기준. 예약(미래)과 발행(과거)을 시각적으로 구분. `publishDate:null`은 캘린더에서 제외(초안 등).
  - **글 목록**: 프로젝트별 Post 리스트 — title, status, publishDate, `liveUrl` 링크, 다국어는 `variants` 뱃지(언어 누락 = `present:false` → 흐림/"누락" 표기).
- **본문 상세 없음** (§0.1-1). 카드/리스트/캘린더 모두 메타데이터만.

### 1.3 사용자 소유 config — 실제 `blogs.config.ts` (3개)

내부용 실제 3개 블로그를 등록. **주의: 이 블로그들은 각각 다른 레포에 있음 — 대시보드는 여러 레포를 로컬에서 읽음.** 절대경로는 **진짜 config(gitignore)에만** 둔다. 아래 표의 경로는 개념 설명용 placeholder(`<PROD_LINE>` = 실제 production-line 절대 베이스).

| id | source | 경로(로컬, placeholder) | fieldMap 요지 |
|----|--------|-----------|--------------|
| reamly | astro-collection | `<PROD_LINE>/reamly/apps/web/src/content/blog`, langs `['en','ko','ja','id']` | title/date/**description**, `groupTranslationsBy:'slug'`. (실제 파일엔 `draft` 필드 없음 → not-draft로 정규화, 과거 날짜라 published.) |
| freelance | markdown | `<PROD_LINE>/12_freelance-invoicer/content/guides` | title/**datePublished**/description, slug, updated←dateModified; `statusRule:{allPublished:true}`. 커스텀 필드(order/h1/crumb/shortAnswer/cta/faq)는 `raw`로 보존. |
| hongix | notion | `databaseId` + `tokenRef:'NOTION_TOKEN'` | Notion 속성 매핑. `databaseId`는 `process.env.NOTION_DB`에서 읽어 **private DB id가 git에 안 박히게** 함. |

- 시크릿·private id는 `.env`(gitignore) + `tokenRef`/`process.env` 참조. 절대 커밋되는 config에 인라인 금지.
- 실제 검증(§0.1-6, 자세히는 §4): 이 진짜 config를 레포 루트에 gitignore된 채로 두고 실블로그로 대시보드를 확인한다.

### 1.4 CLI (`npx postdeck`)

- `apps/cli`: cwd(또는 지정 경로)의 `blogs.config.ts`를 **jiti**로 import → `blogsConfigSchema`로 검증 → `POSTDECK_CONFIG`(resolved 절대경로)를 env로 세팅 → dashboard 앱의 `next dev`를 **spawn** → 브라우저 오픈.
- 최소 플래그만: `--port`, `--no-open`. 그 외 옵션 파싱은 YAGNI.
- OSS 사용자의 진입점. npm publish는 이번 비목표(§4의 이음새만).

---

## 2. Phase 2에 접어 넣을 이월 항목 (Plan 1 리뷰에서 defer된 것)

`.superpowers/sdd/progress.md`에 기록됨. 대시보드 착수 김에 **값싼 것만** 처리:

- **엔진/core (fold in)**: status precedence-collision 테스트(draft+future→draft, allPublished+draft→published), 다국어 primary-selection-by-langs-order 테스트, absent-variant 전체 shape(status/publishDate) assert.
- **localfs (fold in)**: `list()`를 ENOENT만 삼키게 좁히기 (실제 디렉토리를 읽게 되므로 지금 처리).
- **infra (fold in)**: `engines: node>=20` 추가, `typecheck` 스크립트를 새 패키지(apps 포함 필요한 범위)까지 확장.
- **defer (이번 아님)**: `read()` 실제 구현 및 astro `.mdx` 분기 — L1은 `list()`만 쓰므로 런타임 표면 없음. L2/Phase 3에서. CI 셋업(GitHub Actions)도 이번 범위 밖(원하면 §4의 후속으로).

---

## 3. 아키텍처 배치 (Phase 2 산출물)

```
packages/
  core/         # (기존) 변경 없음 또는 테스트 하드닝만
  adapters/     # + loadProjects (engine 확장), localfs list ENOENT 좁히기
apps/
  dashboard/    # (신규) Next.js App Router — 서버측 loadProjects, 카드+캘린더+리스트
  cli/          # (신규) jiti로 config 로드 → next dev spawn
blogs.config.example.ts   # (신규, 커밋) placeholder 경로
.env.example              # (신규, 커밋) NOTION_TOKEN / NOTION_DB 변수명만
# blogs.config.ts, .env   # (로컬 전용, gitignore) 진짜 값
```

- 새 workspace: `apps/dashboard`, `apps/cli`. Next.js 의존성은 `apps/dashboard`에만. `core`/`adapters`는 의존성 경량 유지.
- 의존 방향 불변: `apps`, `adapters` → `core`. `core`는 아무것도 모른다.

---

## 4. OSS-readiness / 배포 (단일 공개 레포)

이 레포는 **공개 OSS 툴**로, 실데이터를 하나도 담지 않는다 → 언제든 공개 가능.

- **`.gitignore` 추가**: `blogs.config.ts`, `.env`. (진짜 값은 로컬 working tree에만 존재; git 추적 안 함.)
- **커밋되는 것**: `blogs.config.example.ts`(placeholder 경로 + 3소스 타입 예시), `.env.example`(변수명만).
- **문서**: 커밋되는 스펙/문서는 실제 절대경로를 placeholder로. 실제 매핑은 gitignore된 config에만. (제품명 reamly/hongix 등의 공개 여부는 추후 사용자가 결정 — Phase 2를 막지 않음.)
- **소비 2모드** (README에 명시):
  1. **CLI 앱**: 진짜 config가 있는 폴더에서 `npx postdeck` (npm publish 후엔 클론 불필요; publish 전엔 workspace 실행).
  2. **라이브러리** (Phase 3): private 스크립트가 `import { … } from '@postdeck/core'`.
- **자세(posture)**: 지금은 **A(같은 폴더)** — 진짜 config가 이 레포 루트에 gitignore된 채 있고 여기서 개발·검증·사용. **B(별도 소비자 폴더/private 레포)**는 npm publish 후 선택. 지금 결정 불필요.
- npm publish 자체는 이번 비목표 — 패키지 경계·`exports`·README 이음새만.

---

## 5. 테스트 전략

- **엔진 (`loadProjects`)**: fixture 단위테스트 —
  - counts(draft/scheduled/published) 정확성.
  - `capabilities`가 소스에서 그대로 전달됨.
  - **per-project 에러 격리**: 한 소스가 throw해도 다른 프로젝트는 정상 로드되고 실패 프로젝트만 `error` 채워짐.
- **대시보드**: 뱃지 로직 위주 경량 컴포넌트 테스트 —
  - "예약(빌드 미반영)" 뱃지는 `enforcesFutureDates:false`일 때만 나타남.
  - variant "누락" 뱃지는 `present:false`일 때만.
- **config**: `blogs.config.example.ts`가 `blogsConfigSchema`로 파싱됨 (진짜 config는 gitignore라 테스트에 넣지 않음).
- **이월 core 테스트** (§2): status precedence, 다국어 primary-selection, absent-variant shape.
- **회귀**: 기존 28 테스트 전부 그대로 green 유지 (loadPosts 불변).

---

## 6. Phase 3 예고 (L2 — 이번 아님)

AI 작성 + De-AI 검토 파이프라인. `createDraft` 쓰기 경로는 이미 구축됨(round-trip 안전). Phase 3에서 추가: (1) 주제→초안 생성(프로젝트 톤 컨텍스트), (2) De-AI 2-패스(LLM 리라이트 + 규칙 린터), (3) `createDraft`로 저장. 이때 어댑터 `read()` 실제 구현(markdown/astro frontmatter+body, astro `.md`/`.mdx`, notion blocks→markdown)도 함께. 그 후 L3(발행 오케스트레이션·재빌드 훅) 별도 제안.

---

## 7. 실행 순서 (writing-plans 입력)

1. **엔진**: `loadProjects` + `ProjectView` (에러 격리 포함) + fixture 테스트. (additive, loadPosts 불변)
2. **core/infra 이월분**: status/translation 테스트 하드닝, localfs ENOENT 좁히기, engines/typecheck.
3. **config**: `blogs.config.example.ts` + `.env.example` + `.gitignore` + 스키마 파싱 테스트. 진짜 `blogs.config.ts`(gitignore)는 검증 단계에서 로컬 생성.
4. **dashboard**: `apps/dashboard` 스캐폴드 → 서버측 `loadProjects` 로딩 → 카드 + 캘린더 + 리스트 + 뱃지 로직 + 에러 카드.
5. **cli**: `apps/cli` — jiti config 로드·검증 → `next dev` spawn → 브라우저 오픈.
6. **검증**: 진짜 config로 대시보드를 실블로그(reamly/freelance/hongix) 상대로 부팅해 3뷰·뱃지·에러 격리 확인.
