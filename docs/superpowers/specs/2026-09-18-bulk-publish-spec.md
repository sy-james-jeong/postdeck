# PostDeck — Spec: Bulk Publish (일괄 발행)

- **작성일**: 2026-09-18 · **상태**: 자율(사용자 위임) → 실행 → 단위+매뉴얼 → 병합·푸시.
- **목적**: 대시보드 글 목록에서 여러 초안을 **한 번에 선택→발행**. 단건 publish 버튼은 유지.

## 0. 결정 (자율)
1. **다중 선택 방식**(체크박스) — "필요한 것만" 발행이 전체 발행보다 유연. 초안 행에만 체크박스, 헤더에 전체선택.
2. 선택 ≥1이면 **bulk bar**(N개 선택됨 · 선택 발행 · 해제) 노출. 성공 시 `router.refresh()` + 선택 해제 + "N개 발행됨(, M개 실패)".
3. **실패 격리**: 한 id가 throw해도 나머지는 계속(per-id 결과 수집).
4. 플립만(publish 시맨틱 그대로) — 배포는 CLI `--deploy`. 대시보드에서 외부 배포 트리거 없음.
5. 서버 렌더였던 PostList 테이블을 **client `PostTable`**로 이동(선택 상태 필요). PostList는 error 프로젝트 숨기고 view를 넘기는 얇은 서버 래퍼로.

## 1. 범위
- `lib/write.ts`: `publishEach(source, ids): Promise<BulkResult[]>`(순수, 실패격리) + `publishManyPost(projectId, ids)`(config→source→publishEach).
- `app/write/actions.ts`: `publishManyAction({projectId, postIds})` → `{ok, results}|{ok:false,error}`.
- `components/PostTable.tsx`(`'use client'`): 테이블+체크박스+전체선택+bulk bar; 기존 단건 Publish/Unpublish 버튼 유지.
- `components/PostList.tsx`: `<PostTable project={project}/>` 얇은 래퍼.
- `globals.css`: `.bulkbar`, 체크박스 accent.

## 2. 테스트
- 단위(`publish-each.test.ts`): 전부 성공→per-id ref, 중간 실패→격리 후 나머지 진행, 빈 입력→[].
- 매뉴얼(샌드박스): 초안 3 + published 1 → 전체선택(체크 3, published 행엔 체크박스 없음) → 선택 발행 → "3개 발행됨", 디스크 3개 published + 커밋 3개, 목록 갱신. **완료.**
- 회귀 106 green, typecheck 클린, `next build` 통과.

## 3. 비목표
- 일괄 **발행취소**(대칭이라 사소, 이후), CLI `--all`, 확인 다이얼로그, 부분실패 상세 리스트 UI — 이후.
