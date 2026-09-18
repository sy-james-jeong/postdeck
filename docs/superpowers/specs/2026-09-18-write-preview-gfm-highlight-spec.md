# PostDeck — Spec: /write Preview GFM + Syntax Highlighting

- **작성일**: 2026-09-18 · **상태**: 자율(사용자 승인, 브레인스토밍 불필요 수준) → 실행 → 단위+빌드 → 병합·푸시.
- **목적**: 오늘 추가한 `/write` markdown 프리뷰를 GFM(표/취소선/체크리스트)과 코드블록 신택스 하이라이트까지 렌더하도록 확장.

## 0. 결정
1. **remark-gfm** (표·취소선·태스크리스트·autolink) + **rehype-highlight** (highlight.js, 코드 하이라이트). 둘 다 raw HTML을 켜지 않음 → 기존 XSS-safe 유지.
2. highlight.js 언어셋 = 기본 **common(~35개)**. 블로그 글이 어떤 언어를 담을지 모르니 커버리지 우선(트림 시 일부 언어 미하이라이트 위험). 대가로 `/write` First Load ~138→195kB. 단일 사용자 로컬 대시보드라 수용. (호스팅 시 언어 서브셋으로 트림 여지 문서화.)

## 1. 범위
- `MarkdownPreview.tsx`: `remarkPlugins={[remarkGfm]}` + `rehypePlugins={[rehypeHighlight]}`.
- `globals.css`: `.preview table/th/td`, 태스크리스트 체크박스, `.preview .hljs-*` 다크 토큰 테마(스코프 한정).
- `apps/dashboard/package.json`: `remark-gfm`, `rehype-highlight`.

## 2. 테스트
- 단위(`MarkdownPreview.test.tsx`, renderToStaticMarkup): 표(`<table>/<th>/<td>`), 취소선(`<del>`), 태스크리스트(`checkbox`/`checked`), 코드 하이라이트(`class="hljs language-js"` + hljs 토큰). 기존 XSS-safe 유지.
- 회귀 103 green, typecheck 클린, `next build` 통과. (렌더링 결정적이라 라이브 Gemini 매뉴얼은 생략 — 유닛이 HTML 출력 자체를 검증.)

## 3. 비목표
- 언어 서브셋 트림(번들 최적화), 수식(KaTeX), mermaid — 이후.
