# PostDeck — Spec: /write Per-Project Language Dropdown

- **작성일**: 2026-09-18 · **상태**: 자율 진행(사용자 위임) → 실행 → 단위+매뉴얼 테스트 → 병합.
- **목적**: `/write`의 자유입력 Language 텍스트필드를 **프로젝트별 언어 드롭다운**으로 교체. 다국어 프로젝트(astro-collection, 예: reamly)에서 대상 언어를 오타 없이 고른다. 단일언어(markdown/notion)는 언어 컨트롤을 아예 숨긴다.
- **선행**: 대시보드 write UI(`generateAction`은 이미 `lang?`를 받음).

## 0. 결정 (자율)
1. langs는 **config에서** 온다: `source.type === 'astro-collection'`이면 `source.langs`, 아니면 `[]`.
2. langs가 있으면 `<select>`(옵션: `default (<langs[0]>)` + 각 lang), 없으면 컨트롤 미표시.
3. 프로젝트 전환 시 lang 리셋(프로젝트마다 옵션이 다름). 빈 값 = 어댑터 기본(첫 lang) 유지 — 기존 동작 불변.
4. 새 의존성 없음.

## 1. 범위
- `apps/dashboard/lib/write-format.ts`: `WritableProject`에 `langs: string[]`; `projectOptions`가 astro면 `source.langs` 채움.
- `apps/dashboard/components/WriteForm.tsx`: 선택 프로젝트의 langs로 `<select>` 조건부 렌더; `onProject`가 lang 리셋.

## 2. 비목표
- **마크다운 프리뷰(본문 렌더링)** — 렌더러 의존성(예: react-markdown) 결정이 필요 → 사용자 확인 후 별도 진행.
- notion 다국어(현재 단일); 언어별 톤 컨텍스트 분리.

## 3. 테스트
- 단위: `projectOptions`가 astro엔 langs, 그 외엔 `[]`.
- 매뉴얼(샌드박스): markdown+astro 2개 프로젝트 config로 부팅 → `/write`에서 markdown 선택 시 언어 컨트롤 없음, astro 선택 시 `default (en)/en/ko` 셀렉트 표시. **완료.**
- 회귀 99 green, typecheck 클린, `next build` 통과.
