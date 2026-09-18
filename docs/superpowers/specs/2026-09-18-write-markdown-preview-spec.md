# PostDeck — Spec: /write Markdown Body Preview

- **작성일**: 2026-09-18 · **상태**: 사용자 승인(react-markdown 채택) → 실행 → 단위+매뉴얼(라이브 1회) → 병합.
- **목적**: 생성된 본문을 raw markdown(`<pre>`)만이 아니라 **렌더링된 프리뷰**로 보여준다. Preview/Markdown 토글로 전환.
- **선행**: 대시보드 write UI, 언어 드롭다운.

## 0. 결정
1. **렌더러 = react-markdown** (사용자 승인). react-markdown 기본은 raw HTML 미렌더(rehype-raw 없음) → LLM 본문의 `<script>`/`<img onerror>`는 이스케이프된 텍스트로만 표시(추가 sanitize 불필요, XSS-safe).
2. Preview/Markdown **세그먼트 토글**, 기본 Preview.
3. GFM(표/취소선) 미도입(base commonmark로 충분; 필요 시 remark-gfm 추후).

## 1. 범위
- `apps/dashboard/components/MarkdownPreview.tsx`: `MarkdownPreview({ markdown })` → `.preview` div 안에서 `<ReactMarkdown>`.
- `WriteForm.tsx`: `view: 'preview' | 'raw'` 상태 + `.viewtoggle` 세그(Preview/Markdown); preview면 `<MarkdownPreview>`, raw면 기존 `<pre>`.
- `globals.css`: `.viewtoggle`/`.seg`(`.result button` 초록 primary를 이기도록 `.viewtoggle` 스코프로 특정성 확보) + `.preview` prose 스타일.
- `apps/dashboard/package.json`: `react-markdown` 의존성.
- `vitest.config.ts`: `.test.tsx` include + `esbuild.jsx:'automatic'`(JSX 파일만 영향, 기존 .ts 테스트 무영향).

## 2. 테스트
- 단위(`MarkdownPreview.test.tsx`, renderToStaticMarkup): (a) heading/bold/em/list → 올바른 HTML, (b) `<script>`/`<img onerror>` → 이스케이프(라이브 HTML 요소 없음). = 렌더링 + XSS-safety 회귀.
- 매뉴얼(샌드박스, 라이브 1회): 샌드박스 markdown 블로그 config로 부팅 → 짧은 주제 Generate(실 Gemini 1회) → 프리뷰가 h3/문단으로 렌더 확인 → Preview↔Markdown 토글 확인 → Save→ draft 파일 저장 + 로컬 커밋 확인(= localfs 수정 후 라이브 save 경로도 검증). **완료.**
- 회귀 101 green, typecheck 클린, `next build` 통과.

## 3. 비목표
- GFM/수식/신택스 하이라이트, 프리뷰 편집(WYSIWYG) — 이후.
