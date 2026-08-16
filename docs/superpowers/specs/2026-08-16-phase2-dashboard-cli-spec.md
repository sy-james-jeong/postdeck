# PostDeck — Phase 2 Spec: Dashboard (L1) + CLI

- **작성일**: 2026-08-16
- **상태**: 다음 착수 대상 (Plan 1 엔진은 완료·main 병합됨)
- **이 문서의 목적**: 새 세션이 이 폴더에서 브레인스토밍→writing-plans→빌드로 바로 이어가도록 다음 단계를 명세.
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

---

## 1. Phase 2 범위 (L1 대시보드 + CLI)

목표: **여러 프로젝트·여러 소스의 블로그 현황을 한 화면에서 읽는다** + `npx`로 로컬 부팅.

### 1.1 반드시 짚을 엔진 갭 (Phase 2에서 먼저 해결)

`loadPosts`는 현재 `Record<string, Post[]>`만 반환하고 **per-project capabilities를 노출하지 않음.** 대시보드가 "예약(빌드 미반영)" 정직 표기를 하려면 각 프로젝트의 `enforcesFutureDates`를 알아야 함.
→ **첫 태스크**: 엔진이 posts와 함께 per-project 메타(capabilities, source type, name, liveUrl)를 반환하도록 확장. 예: `loadProjects(config, deps): Promise<ProjectView[]>` where `ProjectView = { id, name, liveUrl?, capabilities, posts: Post[], counts: {draft,scheduled,published} }`. 기존 `loadPosts`는 유지하거나 이 위에 얹기.

### 1.2 대시보드 (Next.js App Router)

- **스택**: Next.js App Router. 서버 컴포넌트/route handler에서 `loadProjects`를 호출(파일·git·Notion 토큰은 서버측). React UI.
- **뷰**:
  - **프로젝트별 카드**: 이름 + "발행 N · 예약 M · 초안 K" 카운트. `enforcesFutureDates:false`인 소스는 예약 항목에 **"예약(빌드 미반영)"** 뱃지.
  - **캘린더/타임라인 뷰**: 전 프로젝트 통합, publishDate 기준. 예약(미래)과 발행(과거) 구분.
  - **글 목록**: 프로젝트별 Post 리스트 — title, status, publishDate, liveUrl 링크, 다국어는 `variants` 뱃지(언어 누락 = `present:false` 표시).
- **읽기 전용** (쓰기·발행은 Phase 3/L3). 
- 최신 Claude 모델 관련 없음 (이 단계는 순수 읽기 UI).

### 1.3 사용자 소유 config — 실제 `blogs.config.ts` 작성

내부용으로 실제 4개 블로그를 등록 (경로는 로컬 파일시스템 절대경로 또는 설정 가능한 root). **주의: 이 블로그들은 각각 다른 레포에 있음 — 대시보드는 여러 레포를 로컬에서 읽음.**

| id | source | 경로(로컬) | fieldMap 요지 |
|----|--------|-----------|--------------|
| reamly | astro-collection | `…/01_Proudction_Line/reamly/apps/web/src/content/blog`, langs `['en','ko','ja','id']` | title/date/draft/description, `groupTranslationsBy:'slug'` |
| freelance | markdown | `…/01_Proudction_Line/12_freelance-invoicer/content/guides` | title/**datePublished**/description, `statusRule:{allPublished:true}` |
| hongix | notion (env `NOTION_TOKEN`/`NOTION_DB`) 또는 markdown `…/Dev/hongix-site/src/blog/posts` | Title/Date/Status/Excerpt/Tags/Slug (Notion) 또는 title/date/status/excerpt (md) | — |
| ripeledger | (미구축) | `…/01_Proudction_Line/ripeledger/site` | 블로그 붙으면 추가 |

시크릿은 `.env`(gitignore) + `tokenRef`로 env 참조. 절대 config에 인라인 금지.

### 1.4 CLI (`npx postdeck`)

- `apps/cli`: cwd(또는 지정 경로)의 `blogs.config.ts`를 읽어 로컬 대시보드(Next)를 부팅. OSS 사용자의 진입점.
- 최소 기능: 부팅 + 브라우저 오픈. 옵션 파싱 최소(YAGNI).

---

## 2. Phase 2에 접어 넣을 이월 항목 (Plan 1 리뷰에서 defer된 것)

`.superpowers/sdd/progress.md`에 기록됨. 대시보드 착수 김에 값싼 것 처리:

- **엔진/core**: status precedence-collision 테스트(draft+future→draft, allPublished+draft→published), 다국어 primary-selection-by-langs-order 테스트, absent-variant 전체 shape assert.
- **infra**: `engines: node>=20` 추가, tsconfig `**/*.test.ts` exclude (빌드 스텝 도입 시), CI에 `pnpm run typecheck` + `pnpm -w test`.
- **localfs**: `list`를 ENOENT만 삼키게 좁히기.
- **read()**: 현재 3어댑터 다 `throw '기미구현'`. 대시보드는 `list()`만 쓰므로 L1엔 불필요하나, 상세 뷰에서 본문을 보여줄 거면 `read()` 실제 구현 필요 (markdown/astro=frontmatter 파싱 후 body; astro는 `.md`/`.mdx` 둘 다; notion=blocks→markdown). **본문 상세를 L1에 넣을지 여부가 read() 구현 시점을 정함.**

---

## 3. Phase 3 예고 (L2 — 이번 아님)

AI 작성 + De-AI 검토 파이프라인. `createDraft` 쓰기 경로는 이미 구축됨(round-trip 안전). Phase 3에서 추가할 것: (1) 주제→초안 생성(프로젝트 톤 컨텍스트), (2) De-AI 2-패스(LLM 리라이트 + 규칙 린터), (3) 결과를 `createDraft`로 저장. 그 후 L3(발행 오케스트레이션·재빌드 훅) 별도 제안.

---

## 4. 새 세션 착수 순서 (권장)

1. `superpowers:brainstorming`으로 Phase 2 설계 확정 — 특히 §1.1 엔진 갭(capabilities 노출)과 §1.2 대시보드 뷰 구조, §1.4 CLI 부팅 방식.
2. `superpowers:writing-plans`로 Plan 2 작성 (bite-sized TDD).
3. `superpowers:subagent-driven-development`로 실행.

시작 시 반드시 읽을 것: 이 문서 + `2026-08-16-postdeck-design.md` + `.superpowers/sdd/progress.md`(이월 항목).
