# BlogManager — 설계 문서 (Design Spec)

- **작성일**: 2026-08-16
- **상태**: 설계 확정, 구현 계획 대기
- **도구명**: BlogManager · CLI `blogmanager` · 패키지 `@blogmanager/core`, `@blogmanager/adapters`
- **npm**: `blogmanager` / `@blogmanager/*` 사용 가능 확인됨 (2026-08-16)

---

## 1. 문제 정의 (Problem)

여러 프로젝트가 각자 블로그를 운영 중인데(현재 hongix-site, reamly, 12_freelance-invoicer, ripeledger 예정),
**한눈에 볼 방법이 없다.** 각 프로젝트마다:

- 예약 발행이 몇 개 걸려 있는지 / 언제 발행됐는지 파악이 흩어져 있다.
- 블로그 글 작성이 수동이고, AI로 쓰면 "AI스러운" 티가 난다.

목표: **여러 프로젝트 · 여러 소스 타입의 블로그를 한 화면에서 관리 + AI 작성/검토 파이프라인.**

### 차별점 (positioning)

Front Matter CMS / Keystatic / Decap / Tina 는 전부 **"레포 하나 안의 콘텐츠 편집"**이다.
BlogManager의 차별점은 두 가지이며 README 첫 줄에 박는다:

> **여러 프로젝트 · 여러 소스 타입(Notion/Astro/Markdown)을 한 화면에서 + AI 작성/De-AI 검토 파이프라인.**

통합의 폭(breadth)을 moat로 삼지 않는다. moat는 **코어**(집계 UX + AI 파이프라인)이고, 통합은 커뮤니티가 확장하는 플러그인 생태계로 위임한다.

---

## 2. 목표 / 비목표 (Goals / Non-Goals)

### v1 목표 (L1 + L2)
- **L1 대시보드(읽기)**: 프로젝트별 예약/발행/초안 현황을 한 화면에 (카드 + 캘린더).
- **L2 AI 작성/검토**: 주제 → 초안 생성 → De-AI 검토(2-패스) → 소스에 **draft로 저장**(발행은 사람이).

### v1 비목표 (이음새만 남기고 지연)
- **L3 발행 오케스트레이션**: 발행일 지정, 재빌드 훅 트리거. (L2 완료 후 별도 제안)
- **플러그인 로더 / 커뮤니티 어댑터 레지스트리**: 인터페이스와 `type` 레지스트리 이음새만.
- **관례 자동감지(auto-detect)**: 선언적 config로 대체.
- **멀티테넌트 auth / billing / 호스팅 버전**: 구조만 호스팅-가능하게, 기능은 미구현.

### 장기 방향 (설계가 막지 말아야 할 것)
- 오픈소스 공개 → "자기 키 쓰기 귀찮은 사람"을 위한 **호스팅 구독 서비스**.
- 이 전환이 **재작성이 아니라 레이어 추가**가 되도록 지금 이음새를 잡는다.

---

## 3. 아키텍처 — 헥사고날 (코어/엣지 분리)

핵심 원칙:

> **모든 소스 규약에 도구가 맞추지 않는다. 안정적 계약을 도구가 정의하고, 소스를 거기에 맞추게 하되 — 맞추는 코드(어댑터/config)를 코어팀이 아니라 사용자/커뮤니티가 소유한다.**

### 모노레포 3-패키지 경계

```
packages/
  core/        # 순수 TS. Post 모델, 정규화, status 규칙, AI 파이프라인.
               # Next·fs·Notion 의존성 0. moat이자 오픈소스 심장. 독립 npm 배포 가능.
  adapters/    # BlogSource 구현체(first-party 3개) + FileStore 구현체(localFs).
               # core에만 의존.
apps/
  dashboard/   # Next.js(App Router). React UI + API routes(fs·git·Notion 토큰은 서버측).
               # 나중에 그대로 유료 멀티테넌트 웹앱으로 승격.
  cli/         # `npx blogmanager` — cwd의 blogs.config 읽어 dashboard를 로컬 부팅.
blogs.config.ts # 사용자 소유 계약. 관리 대상 블로그 등록 + 필드매핑 (data-only).
```

**의존 방향**: `apps`, `adapters` → `core`. `core`는 아무것도 모른다.
→ core를 독립 패키지로 오픈소스화 가능, dashboard는 교체 가능한 UI.

**스택 선택**: Next.js App Router.
대시보드는 콘텐츠 사이트가 아니라 인터랙티브 앱이고, 파일/git/Notion 토큰을 서버측에서 안전히 다루려면 API routes가 자연스럽다. 그리고 이 앱이 그대로 호스팅 웹앱이 된다. (스택 통일 목적이면 Astro-SSR도 가능하나 앱 성격엔 Next가 정석.)

---

## 4. 공통 Post 모델 (코어 도메인)

```ts
interface Post {
  id: string            // 소스 내 안정 식별자 (slug 또는 Notion page id)
  project: string       // 어느 관리 블로그 (config의 id)
  title: string
  slug: string
  status: 'draft' | 'scheduled' | 'published'   // 정규화된 3-상태
  publishDate: Date | null
  updatedDate?: Date
  excerpt: string
  tags: string[]
  author?: string
  liveUrl?: string      // published면 실제 URL
  variants?: PostVariant[]  // 다국어 번역세트 (코어가 묶음)
  raw: Record<string, unknown>  // 원본 frontmatter/속성 — 쓰기 라운드트립용 (필수)
}

interface PostVariant {
  lang: string
  status: 'draft' | 'scheduled' | 'published'
  publishDate: Date | null
  present: boolean      // 해당 언어 파일 존재 여부 (누락 감지)
}
```

### status 정규화 규칙 (프로젝트 config가 결정)

- `draft`: draft 플래그 true / status==draft / drafts 폴더
- `scheduled`: draft 아님 **AND** `publishDate > now` (도구 관례)
- `published`: 그 외
- status 필드 없는 소스(예: freelance): config `statusRule: { allPublished: true }` → 전부 published

> ⚠️ **"예약"의 정직성**: 현재 hongix/reamly/freelance 빌드는 미래 날짜를 실제로 필터링하지 않는다. 즉 미래 날짜 글도 사이트에 이미 떠 있을 수 있다. 어댑터가 `enforcesFutureDates: false`를 선언하면 대시보드는 **"예약(빌드 미반영)"**으로 표기한다 — 거짓말하지 않는다. (실제 예약 발행은 L3.)

### 다국어 = 코어가 처리

어댑터는 언어별 파일을 그냥 공급하고, config `groupTranslationsBy: 'slug'`면 코어가 하나의 `Post` + `variants[]`로 묶는다. reamly 특성이 코어 밖으로 새지 않는다. 언어 누락은 `variants[].present`로 UI 뱃지 표시.

---

## 5. 어댑터 계약 (공개 API)

```ts
interface BlogSource {
  capabilities: SourceCapabilities
  list(): Promise<RawPost[]>            // 대시보드 (L1)
  read(id: string): Promise<PostBody>
  createDraft(post: DraftInput): Promise<Ref>  // AI 초안 저장 (L2)
  // publish(id): Promise<void>         // L3 — 인터페이스 자리만
}

interface SourceCapabilities {
  canWrite: boolean
  enforcesFutureDates: boolean   // 빌드가 미래 날짜를 실제로 거르는가
  supportsTranslations: boolean
}
```

### first-party 어댑터 3개
- `notion` — Notion DB. (FileStore 미사용, Notion API 직접)
- `astro-collection` — Astro content collection (다국어 폴더 구조). FileStore 사용.
- `markdown` — 일반 마크다운 디렉토리. FileStore 사용.

### 쓰기 안전성 — 패치, 덮어쓰기 금지 (v1 최우선 불변식)

`createDraft` 및 이후 업데이트는 **fieldMap에 있는 키만 건드리고, 나머지 frontmatter는 `raw`로 보존해 라운드트립**한다. freelance의 `shortAnswer`/`cta`/`order`/`h1`/`crumb` 같은 커스텀 필드를 첫 저장에 날려버리면 오픈소스 1번 이슈가 된다.

> **테스트 우선 규율**: 코드보다 fixture 테스트를 먼저 짠다.
> freelance의 실제 frontmatter 하나를 fixture로 넣고 **read → write → diff == 0** 이어야 통과. 이게 오픈소스 신뢰의 첫 관문.

---

## 6. FileStore 포트 (호스팅 이음새)

파일계 어댑터(`markdown`, `astro-collection`)는 로컬 `fs`를 직접 부르지 않고 포트에 의존한다.

```ts
interface FileStore {
  list(dir: string): Promise<string[]>
  read(path: string): Promise<string>
  write(path: string, content: string, opts: { message: string }): Promise<void>
  //                                          ^ 커밋 메시지를 포트가 품는다
}
```

- **v1 구현**: `localFs` — fs write + git commit.
- **나중 구현**: `githubContentsApi` — write가 곧 commit (유저 레포는 GitHub에 있으므로). 어댑터 코드 **무수정**.
- `write`가 `message`를 품어 로컬(fs+git)과 GitHub(Contents API)가 한 인터페이스로 수렴. 나중에 브랜치/PR 옵션을 붙일 자리도 자연스럽다.

---

## 7. 사용자 소유 계약 — `blogs.config.ts` (직렬화 가능)

**config는 데이터여야 한다** (팩토리 함수/클로저 금지). 호스팅 버전에서 같은 config를 테넌트별 DB에 저장해야 하므로 JSON 직렬화가 되어야 한다.

```ts
export default defineBlogs([
  { id: 'hongix', name: 'Hongix', liveUrl: 'https://hongix.com/blog',
    source: { type: 'notion', databaseId: '…', tokenRef: 'HONGIX_NOTION_TOKEN' },
    fieldMap: { title: 'title', date: 'date', status: 'status', excerpt: 'excerpt', tags: 'tags' } },

  { id: 'reamly',
    source: { type: 'astro-collection', dir: '…/content/blog', langs: ['en','ko','ja','id'] },
    fieldMap: { title: 'title', date: 'date', draft: 'draft', excerpt: 'description' },
    groupTranslationsBy: 'slug' },

  { id: 'freelance',
    source: { type: 'markdown', dir: '…/content/guides' },
    fieldMap: { title: 'title', date: 'datePublished', excerpt: 'description' },
    statusRule: { allPublished: true } },
])
```

### 구현 규칙
- `source`는 **discriminated union**(`type` 판별자). 런타임에 **어댑터 레지스트리**가 `type` → 구현체를 찾는다. 이것이 곧 Tier 3 플러그인 로더의 이음새(레지스트리에 등록만 하면 확장).
- `defineBlogs` / `notionSource(...)` 등은 **타입드 헬퍼일 뿐, 출력은 순수 data 객체**(클로저 없음) → 자동완성/타입체크 + JSON 직렬화 둘 다 확보.
- **Zod 스키마를 같은 곳에서 정의**해 헬퍼가 뱉는 shape와 공유한다. 나중에 DB에서 읽은 config 검증이 공짜가 된다.

### 확장성 3-tier (breadth를 남에게 위임)

| Tier | 무엇 | 유지보수 주체 |
|------|------|--------------|
| 관례(convention) | 표준 필드명이면 config 0 | 아무도 |
| 선언적 config | 필드명 다르면 fieldMap 선언 | **사용자** (자기 레포에 커밋) |
| 커스텀 어댑터 플러그인 | 괴상한 소스는 `BlogSource` 구현 JS 모듈 | **커뮤니티/파워유저** |

v1은 Tier 1~2("선언적 config")까지 구현, Tier 3는 레지스트리 이음새만.

---

## 8. AI 작성 / 검토 파이프라인 (L2)

2-패스 구조:

1. **작성(generate)**: 주제 + 프로젝트 컨텍스트(그 블로그 톤·기존 글 샘플) → 초안 생성. (최신 Claude 모델 사용)
2. **De-AI 검토(review)**: 두 갈래 합성
   - **LLM 리라이트 패스**: 사람스러운 톤으로 다시 씀.
   - **규칙 린터**: 과용 접속사("however/moreover"), "in conclusion"/"it's worth noting", em-dash 남발, 균일한 문장 길이, 리스티클 패딩, 이모지 등 플래그.
   - 산출물: 수정 초안 + 검토 리포트(무엇을 왜 고쳤는지).
3. **저장(createDraft)**: 어댑터로 draft 저장.
   - 마크다운/Astro: 브랜치에 커밋, **그 프로젝트의 fieldMap 규약대로 frontmatter 출력** + `raw` 보존.
   - Notion: draft 페이지 생성 (매핑된 속성).
   - **자동 발행 안 함** — 리뷰는 사람이.

fieldMap이 읽기·쓰기 양쪽에서 값을 하므로, 저장 결과가 각 프로젝트 규약에 자동 정합.

---

## 9. 테스트 전략

- **core는 순수 TS** → 실제 4개 프로젝트에서 뽑은 fixture로 단위 테스트:
  - status 정규화 규칙 (draft/scheduled/published, allPublished)
  - 다국어 그룹핑 (variants, 누락 감지)
  - De-AI 린터 규칙
- **어댑터**: fixture 파일 + 녹화된 Notion 응답으로 테스트.
- **최우선(코드보다 먼저)**: 쓰기 **round-trip diff == 0** 테스트 (freelance 실제 frontmatter fixture). §5 참조.

---

## 10. 구현 순서 (권장)

1. **round-trip 테스트 + `raw` 보존 라운드트립** (fixture-first, freelance 케이스). ← 신뢰의 관문, 코드보다 먼저.
2. `core`: Post 모델 + Zod config 스키마 + status 정규화 + 다국어 그룹핑 (fixture 단위테스트).
3. `adapters`: `FileStore(localFs)` + `markdown` / `astro-collection` / `notion` + 레지스트리.
4. `apps/dashboard`: L1 읽기 대시보드 (카드 + 캘린더, capability 반영 표기).
5. `apps/dashboard`: L2 AI 작성/검토 파이프라인 + createDraft.
6. `apps/cli`: `npx blogmanager` 부팅.
7. (L2 검증 후) L3 제안 — 발행 오케스트레이션 + 재빌드 훅.

---

## 부록 A — 실측 소스 스키마 (2026-08-16)

| 프로젝트 | 소스 | 날짜 필드 | 상태 필드 | 요약 필드 | 특이점 |
|---------|------|----------|----------|----------|--------|
| hongix-site | Notion DB 또는 로컬 `src/blog/posts/*.md` | `date` | `status`(draft/published) | `excerpt` | tags, author. Notion은 `notion.mjs`로 같은 shape 스왑인 |
| reamly | Astro collection `src/content/blog/{en,ko,ja,id}/` | `date` | `draft`(bool) | `description` | **다국어 번역세트**, tool/cover |
| 12_freelance-invoicer | Vite, `content/guides/*.md` | `datePublished` | **없음** | `description` | `order`,`h1`,`crumb`, 구조화 `shortAnswer`/cta |
| ripeledger | `site/` (미구축) | — | — | — | 예정 |

핵심 시사점: 마크다운 소스끼리도 필드명이 다르다(date/date/datePublished, status/draft/없음). → 어댑터 경계는 "Notion vs 마크다운"이 아니라 **"프로젝트별 config"**. 이질성은 전부 `blogs.config.ts` 한 곳에 격리된다.
