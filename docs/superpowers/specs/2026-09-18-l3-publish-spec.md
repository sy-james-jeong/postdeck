# PostDeck — Spec: L3 Publish Orchestration

- **작성일**: 2026-09-18 · **상태**: 설계 확정(브레인스토밍 승인) → plan → 실행.
- **목적**: 저장된 draft를 발행(draft→published)하고, 선택적으로 사이트를 배포(git push→CI)한다. L1(읽기)·L2(작성) 위의 마지막 v1 조각.
- **선행**: Phase 2/3, Gemini provider, 대시보드 write UI. `BlogSource`에 `// publish(id): Promise<void> // L3` 이음새가 이미 있음.

## 0. 브레인스토밍 확정 결정
1. **배포 = git 커밋+푸시 → CI 자동배포.** 실제 go-live(push)는 **명시적 `--deploy` 플래그**에서만. 기본은 로컬 플립만(외부로 안 나감).
2. **발행 범위 = 3개 어댑터 다** (`publish()` 범용 seam). freelance는 `allPublished`라 사실상 no-op이어도 seam 균일하게.
3. **surface = CLI 우선** (`postdeck publish`). 대시보드 버튼은 이후.

### 실블로그 현황(참고)
- hongix(notion): `Status` 속성 → draft/published. 플립 의미 있음.
- reamly(astro): 파일에 `draft` 필드 없음·fieldMap에도 없음 → 플립은 reamly의 Astro 빌드가 `draft`를 실제로 거를 때만 의미(미검증, 문서화만).
- freelance(markdown): `statusRule: allPublished`, status 필드 없음 → 플립 no-op(무해).

## 1. 범위

### 1.1 `publish(id)` 어댑터 이음새 (core `BlogSource`)
`BlogSource`에 `publish(id: string): Promise<Ref>` 추가(주석 이음새 대체). 각 어댑터가 draft→published를 **소스에서** 플립, round-trip 안전:
- **markdown**: 대상 파일을 `parseFrontmatter`로 읽고 status 필드(`fm.status ?? 'status'`)를 `cfg.publishStatus ?? 'published'`로 `patchFrontmatter` → `FileStore.write`(로컬 git 커밋 포함). 나머지 frontmatter·본문 보존.
- **astro**: 대상 파일의 `fm.draft ?? 'draft'` 키를 `false`로 patch → `FileStore.write`. (id=`lang/slug`.)
- **notion**: `PATCH /v1/pages/{id}` `properties[fm.status]` = `{ status: { name: cfg.publishStatus ?? 'Published' } }`. `Ref = { id, url }`.
- 대상 못 찾으면 명확한 throw.

### 1.2 배포 (deploy, `--deploy`에서만)
- 순수 헬퍼 아님(git 실행). `deployProject(repoDir, opts): Promise<void>` (adapters, node): `git push`를 `repoDir`에서 실행. notion처럼 플립이 git 변경을 안 만든 경우 `opts.emptyCommit`이면 `git commit --allow-empty -m "publish: <slug>"` 후 push.
- `repoDir` 결정: file-based는 소스 dir에서 `git rev-parse --show-toplevel` 자동 감지; notion 등은 `cfg.repoDir` 필수. 둘 다 없으면 명확한 에러.
- **기본(무 `--deploy`)**: 플립만 하고 "로컬 발행됨 · `--deploy`로 배포" 안내. 외부 작업 없음.

### 1.3 CLI (`postdeck publish`)
`postdeck publish --project <id> --slug <slug> [--deploy] [--config <path>]`
- `.env` 로드 → config 로드 → project 해석(없으면 에러). deps 구성(`createLocalFs('/')`, env, fetch; llm 불필요).
- `source.list()`에서 slug(또는 id) 매칭 → 대상 post id → `source.publish(id)`.
- `--deploy`면: file-based는 `deployProject(repoDir)`; notion은 `deployProject(cfg.repoDir, { emptyCommit, message })`.
- 결과 출력: `published: <ref>` (+ `--deploy` 시 `deployed: git push <repoDir>`).
- `parseArgs`는 `write.ts`처럼 순수 파서로 분리(테스트).
- `main.ts`에 `publish` 서브커맨드 분기 추가(기존 `write`/dashboard-boot 분기 옆).

### 1.4 config 추가 (zod, 선택·additive)
- `publishStatus?: string` (프로젝트별 published 값/이름).
- `repoDir?: string` (배포 git 레포; file-based 자동감지, notion 필수).
- 기존 config 무영향(둘 다 optional).

## 2. 테스트
- `publish()` per adapter(단위):
  - markdown: tmpdir+localFs — draft 파일 발행 후 status가 published로 바뀌고 **커스텀 필드/본문 보존**(round-trip).
  - astro: `.md` 파일 `draft:true→false`, 다른 필드 보존.
  - notion: fake `fetchImpl` — PATCH URL/바디(`Status.name=Published`) 정확, `Ref` 반환.
- CLI `parseArgs`(publish) 단위.
- `deployProject`: git 실행은 **테스트에서 실제 push 금지**. 명령 인자 구성만 순수 헬퍼(`buildDeployCommands(repoDir, opts)`)로 분리해 단위 테스트; 실제 실행은 수동/실환경.
- 회귀: 기존 86 green.

## 3. 안전 / 비목표
- **outward-facing(git push→라이브)는 `--deploy` 플래그 뒤**. 기본은 로컬·되돌리기 쉬운 플립.
- 대시보드 publish 버튼, 예약발행 스케줄러, unpublish, reamly draft-필터 검증 — 전부 이후.
- 실제 배포 검증은 사용자가 실블로그로(테스트는 push 안 함).

## 4. 실행 순서 (plan 입력)
1. core: `BlogSource.publish(id): Promise<Ref>` 인터페이스 + `publishStatus`/`repoDir` config(zod, optional). (기존 어댑터가 인터페이스 미구현이면 타입 에러 → 2·3에서 채움; 또는 seam 추가와 동시에 stub throw로 시작.)
2. markdown/astro `publish()` 구현 + tmpdir 테스트(round-trip 보존).
3. notion `publish()` 구현 + fake-fetch 테스트.
4. `buildDeployCommands`(adapters, 순수) + `deployProject`(adapters, git 실행) + CLI `postdeck publish`(parseArgs+runPublish) + `main.ts` 분기. `parseArgs`·`buildDeployCommands` 테스트, 회귀+typecheck.
