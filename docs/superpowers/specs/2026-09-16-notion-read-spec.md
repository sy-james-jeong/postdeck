# PostDeck — Spec: Notion read() (blocks → markdown)

- **작성일**: 2026-09-16 · **상태**: 자율 진행 → plan → 실행.
- **목적**: notion 어댑터의 `read()`(현재 throw)를 구현. hongix(Notion) 글의 본문을 blocks→markdown으로 반환 → `gatherToneContext`가 excerpt 폴백 대신 **실제 본문**을 톤 샘플로 쓰게 되고, 향후 상세 뷰의 토대. markdown/astro `read()`는 이미 구현됨.
- **선행**: Phase 3 L2, `gatherToneContext`(read() 시도 후 excerpt 폴백).

## 0. 결정 (자율)
1. `read(id)`: id=Notion page id. `GET /v1/pages/{id}`(속성) + `GET /v1/blocks/{id}/children`(본문, 페이지네이션) → `blocksToMarkdown` → `{ post: toPost(rawPost, cfg, now), body }`. 기존 `canonicalFields`/`readText`/`H`/`doFetch`(fetchImpl 주입) 재사용.
2. **`blocksToMarkdown(blocks)`는 순수 함수**(별 파일 `notion-blocks.ts`) — 녹화된 block 객체로 완전 단위 테스트(네트워크 X). read()도 fake `fetchImpl`로 테스트.
3. v1 지원 블록: paragraph, heading_1/2/3, bulleted/numbered_list_item, to_do, quote, code, divider. 그 외 타입은 rich_text 있으면 텍스트만. **중첩(children) 미지원**(top-level flat) — 톤 스니펫엔 충분, 나중에.
4. rich_text는 `plain_text` 이어붙임(인라인 볼드/이탤릭 주석 v1 생략).
5. notion `read()` 구현 외 다른 변경 없음. `gatherToneContext`/UI는 자동으로 혜택(코드 변경 0).

## 1. 범위
- `packages/adapters/src/notion-blocks.ts`: `blocksToMarkdown(blocks: unknown[]): string`.
- `packages/adapters/src/notion.ts`: `read()` 구현(`toPost`/`PostBody` import 추가, `blocksToMarkdown` 사용). `list`/`createDraft` 불변.
- `packages/adapters/src/index.ts`: `blocksToMarkdown` export(테스트/재사용).

## 2. 비목표
- 중첩 블록, 인라인 마크(bold/italic/link), 이미지/임베드, 상세 뷰 UI. 전부 이후.

## 3. 테스트
- `blocksToMarkdown`: 각 블록 타입 fixture → 기대 md(heading `#`, bullet `-`, numbered `1.`, todo `- [ ]/[x]`, quote `>`, code fence+lang, divider `---`, paragraph 평문, unknown 스킵). 빈 배열 → ''.
- notion `read()`: fake `fetchImpl`(page GET / blocks GET URL 분기)로 `{post, body}` 반환 — `post.title` 정확, body에 heading/문단 포함, 페이지네이션(has_more→2페이지) 합쳐짐.
- 회귀: 기존 82 green.

## 4. 실행 순서
1. `notion-blocks.ts` `blocksToMarkdown` + fixture 테스트 + index export.
2. notion `read()` 구현 + fake-fetch 테스트(페이지네이션 포함). 회귀+typecheck.
