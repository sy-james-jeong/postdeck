# PostDeck — Spec: Dashboard Publish Button (close the L1→L3 loop)

- **작성일**: 2026-09-18 · **상태**: 자율 진행(사용자 위임) → plan → 실행 → 단위+매뉴얼 테스트 → 병합.
- **목적**: L3 `publish()`를 대시보드에 노출. 글 목록의 **draft 글**에 '발행' 버튼 → 클릭하면 draft→published 플립. 이제 읽기·작성·발행을 브라우저 한 곳에서.
- **선행**: L1 대시보드, L2 write UI(server actions), L3 `publish()`.

## 0. 결정 (자율)
1. **플립만, 배포는 안 함.** 버튼은 `publish()`(로컬·되돌리기 쉬움)만 호출. 실제 라이브 반영(`git push`)은 **CLI `--deploy`에만** 유지 — one-click UI로 외부 배포를 트리거하지 않는다(안전 경계). 버튼 옆 안내: "발행(로컬) · 라이브는 배포 필요".
2. **draft 글에만** 버튼 노출(`post.status === 'draft'`).
3. 성공 시 `router.refresh()`로 서버 데이터 재조회(상태가 published로 갱신).

## 1. 범위
### 1.1 서버 글루 (`apps/dashboard/lib/write.ts`에 추가, server-only)
```ts
publishPost(projectId: string, postId: string): Promise<Ref>
```
- config 로드 → project 찾기(없으면 throw) → `resolveSource(cfg, { fileStore: createLocalFs('/'), env, fetchImpl })`(llm 불필요) → `source.publish(postId)` → `Ref`.

### 1.2 Server action (`apps/dashboard/app/write/actions.ts`에 추가, `'use server'`)
```ts
publishAction(input: { projectId: string; postId: string }): Promise<{ ok: true; ref: Ref } | { ok: false; error: string }>
```
- try/catch로 에러 → `{ ok:false, error }`.

### 1.3 클라이언트 버튼 (`apps/dashboard/components/PublishButton.tsx`, `'use client'`)
- `PublishButton({ projectId, postId })`: '발행' 버튼, `useTransition`. 클릭 → `publishAction` → 성공 시 '발행됨 ✓' + `useRouter().refresh()`; 실패 시 에러 텍스트.

### 1.4 글 목록 연결 (`apps/dashboard/components/PostList.tsx`)
- 각 post row에서 `post.status === 'draft'`면 상태 셀(또는 액션 셀)에 `<PublishButton projectId={project.id} postId={post.id} />`. published/scheduled는 버튼 없음.

## 2. 비목표
- 배포(`--deploy`) one-click 트리거(안전상 CLI 유지); unpublish; 일괄 발행; 확인 다이얼로그. 이후.

## 3. 테스트
- **단위**: `publishPost`/`publishAction`은 실 config·소스 의존 글루라 유닛 대신 빌드+매뉴얼로 검증(L3 `publish()`는 이미 유닛 테스트됨). 순수 판정(`post.status === 'draft'`)은 자명 → 인라인. (테스트 추가 없이 회귀 93 green 유지 + `next build` 통과.)
- **매뉴얼(샌드박스, 실블로그·크레딧 무접촉)**: tmpdir에 markdown 블로그 + `status: draft` 글 하나를 만든 임시 `blogs.config.ts`로 대시보드를 부팅 → 글 목록에서 그 draft에 '발행' 버튼 확인 → 클릭 → status가 published로 플립되고 목록 갱신 확인. (파일 플립 = 로컬 git 커밋, 되돌리기 쉬움; `--deploy` 없음.)
- 회귀: 기존 93 green, typecheck 클린, `next build` 컴파일.

## 4. 실행 순서 (plan 입력)
1. `lib/write.ts` `publishPost` + `actions.ts` `publishAction`.
2. `PublishButton.tsx` + `PostList.tsx` 연결. `next build` 스모크(라이브 X). 회귀+typecheck.
3. (컨트롤러) 샌드박스 매뉴얼 테스트.
