# PostDeck — Spec: Unpublish (published→draft), CLI-first

- **작성일**: 2026-09-18 · **상태**: 자율 진행(사용자 위임) → plan → 실행 → 단위+매뉴얼 테스트 → 병합.
- **목적**: 발행된 글을 다시 draft로 되돌리는 `unpublish()`를 L3 publish와 **대칭**으로 추가. surface = CLI 우선(`postdeck unpublish`), 대시보드 버튼은 이후.
- **선행**: L3 publish (`BlogSource.publish`, `postdeck publish`, deploy). localfs root-store fix (`04fe54f`).

## 0. 결정 (자율)
1. **publish와 완전 대칭.** 같은 seam·같은 CLI 구조·같은 `--deploy` 게이트(기본 로컬 플립만, 되돌리기 쉬움).
2. **draft 판정값으로 되돌린다** (round-trip 안전 — `unpublish` 후 `list()`가 그 글을 draft로 읽어야 함). `normalizeStatus` 규칙을 그대로 만족:
   - markdown: `[fm.status ?? 'status']` = `cfg.statusRule?.draftValue ?? 'draft'`.
   - astro: `[fm.draft ?? 'draft']` = `true` (publish의 `false` 대칭).
   - notion: `properties[fm.status]` = status name `cfg.statusRule?.draftValue ?? 'Draft'`.
3. **`allPublished` 소스(freelance)**: `normalizeStatus`가 항상 published라 unpublish는 사실상 무의미하지만 seam은 균일하게 둠(publish의 no-op 성질과 동일). 문서화만.

## 1. 범위
### 1.1 core `BlogSource.unpublish(id: string): Promise<Ref>`
- `publish` 바로 옆에 추가(대칭 seam). 3개 어댑터가 구현.

### 1.2 어댑터 `unpublish()` (publish 미러)
- **markdown**: 대상 파일 찾기 → `patchFrontmatter(content, { [fm.status ?? 'status']: cfg.statusRule?.draftValue ?? 'draft' })` → `fs.write`(로컬 git 커밋). 본문·나머지 frontmatter 보존. 못 찾으면 throw.
- **astro**: 대상 파일 찾기(`.md`/`.mdx`, id=`lang/slug`) → `patchFrontmatter(content, { [fm.draft ?? 'draft']: true })` → `fs.write`. 못 찾으면 throw.
- **notion**: `PATCH /v1/pages/{id}` `properties[fm.status] = { status: { name: cfg.statusRule?.draftValue ?? 'Draft' } }`. `fm.status` 없으면 throw. `Ref = { id, url }`.

### 1.3 CLI `postdeck unpublish --project <id> --slug <slug> [--deploy] [--config <path>]`
- `publish.ts`와 동일 구조를 `unpublish.ts`로: `parseUnpublishArgs`(순수) + `runUnpublish`.
- `.env` 로드 → config 로드 → project 해석 → deps(`createLocalFs('/')`, env, fetch) → `list()`에서 slug/id 매칭 → `source.unpublish(id)`.
- 출력: `unpublished: <ref>`; `--deploy` 없으면 `(local flip only — pass --deploy to git push and go live)`.
- `--deploy`: publish와 동일(file-based는 gitToplevel 자동감지·flip이 이미 커밋됨; notion은 `cfg.repoDir` + `emptyCommit`, message `unpublish: <slug>`).
- `main.ts`에 `unpublish` 서브커맨드 분기 추가(기존 `write`/`publish`/dashboard-boot 옆).

## 2. 테스트
- 어댑터 단위(각):
  - markdown: tmpdir+localFs — published 파일 unpublish 후 status가 draftValue로 바뀌고 **커스텀 필드/본문 보존**; `toPost`/list가 draft로 읽음(round-trip).
  - astro: `.md` `draft:false→true`, 다른 필드 보존.
  - notion: fake `fetchImpl` — PATCH URL/바디(`status.name = draftValue`) 정확, `Ref` 반환.
- CLI `parseUnpublishArgs` 단위(publish 미러).
- 회귀: 기존 94 green, typecheck 클린. `deployProject`는 publish와 동일 헬퍼 재사용(실 push 테스트 없음).
- **매뉴얼(샌드박스)**: git-init tmpdir markdown 블로그의 published 글 하나를 `postdeck unpublish`로 되돌려 status가 draftValue로 플립 + 로컬 커밋 확인(`--deploy` 없이).

## 3. 안전 / 비목표
- outward-facing(live에서 내리기)은 `--deploy` 뒤. 기본은 로컬·되돌리기 쉬운 플립.
- 대시보드 unpublish 버튼(published 행), 일괄, 확인 다이얼로그 — 이후.

## 4. 실행 순서 (plan 입력)
1. core `BlogSource.unpublish` 인터페이스 + 3개 어댑터 stub→구현.
2. markdown/astro `unpublish()` + tmpdir 테스트(round-trip).
3. notion `unpublish()` + fake-fetch 테스트.
4. `unpublish.ts`(parse+run) + `main.ts` 분기 + parse 테스트. 회귀+typecheck. 매뉴얼 샌드박스.
