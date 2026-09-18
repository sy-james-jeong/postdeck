# PostDeck — Spec: Dashboard Unpublish Button (complete the browser toggle)

- **작성일**: 2026-09-18 · **상태**: 자율 진행(사용자 위임) → 실행 → 매뉴얼+빌드 테스트 → 병합.
- **목적**: 대시보드 글 목록의 **published 글**에 '초안으로' 버튼 → 클릭하면 published→draft 플립. publish 버튼(draft 행)과 대칭 = 브라우저 한 곳에서 발행/취소 토글 완성.
- **선행**: 대시보드 publish 버튼, CLI unpublish (`BlogSource.unpublish`).

## 0. 결정 (자율)
1. **플립만, 배포 안 함** (publish 버튼과 동일 안전 경계). `unpublish()`는 로컬·되돌리기 쉬움; 라이브 반영은 CLI `--deploy` 유지.
2. **published 글에만** 버튼(`post.status === 'published'`). draft=publish 버튼, scheduled=버튼 없음.
3. 성공 시 `router.refresh()`로 재조회(→ draft로 갱신되며 그 행엔 이제 publish 버튼이 뜸).
4. 시각적으로 덜 강조(ghost 스타일 `.btn-sm-ghost`) — 취소는 조용한 되돌리기 액션.

## 1. 범위
- `apps/dashboard/lib/write.ts`: `unpublishPost(projectId, postId): Promise<Ref>` (publishPost 미러, `source.unpublish`).
- `apps/dashboard/app/write/actions.ts`: `unpublishAction` (try/catch).
- `apps/dashboard/components/UnpublishButton.tsx` (`'use client'`): '초안으로' 버튼, useTransition, 성공 시 '초안으로 됨 ✓' + refresh.
- `apps/dashboard/components/PostList.tsx`: published 행에 `<UnpublishButton>`.
- `globals.css`: `.btn-sm-ghost`.

## 2. 테스트
- 빌드+매뉴얼(글루라 유닛 대신; `unpublish()`는 이미 유닛됨). `next build` 통과, 회귀 99 green, typecheck 클린.
- 매뉴얼(샌드박스): published 글에 '초안으로' 확인 → 클릭 → draft로 플립 + 로컬 커밋 + 행 갱신(이제 publish 버튼) 확인. **완료.**

## 3. 비목표
- 배포 one-click, scheduled 행 처리, 확인 다이얼로그 — 이후.
