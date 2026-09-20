# PostDeck — Spec: OpenAI (ChatGPT) LLM Provider

- **작성일**: 2026-09-19 · **상태**: 자율(사용자 위임) → 실행 → 단위+스모크 → 병합·푸시.
- **목적**: LLM 프로바이더에 **OpenAI(ChatGPT)** 추가. 기존 gemini/anthropic와 대칭. 이제 세 주요 프로바이더(gemini 기본·anthropic·openai)를 `POSTDECK_LLM`으로 선택.
- **참고**: 프로바이더는 여전히 **전역 env 선택**(인스턴스당 하나). 사용자별 UI 선택/키 입력은 서비스화 단계의 별도 결정(키는 env 유지로 결정됨).

## 1. 범위
- `packages/adapters/src/openai-llm.ts`: `createOpenAILLM(deps)` — gemini 미러(지연 클라이언트 생성 + missing-key 가드로 CLI 클린 에러). `openai` SDK `chat.completions`. 모델 `POSTDECK_OPENAI_MODEL ?? 'gpt-4o-mini'`(env 오버라이드 — OpenAI도 모델 id 로테이션).
- `llm-select.ts`: `provider === 'openai'` 분기 + 에러 메시지 3종.
- index export, adapters `openai` 의존성.
- `apps/cli/src/write.ts`: missing-cred 안내를 3 프로바이더로 갱신.
- `.env.example`: `OPENAI_API_KEY` + 모델 오버라이드 주석.

## 2. 테스트
- 단위: `openai-llm.test.ts`(클라이언트 반환·no-key api-key 에러·모델 오버라이드), `llm-select` openai 분기.
- 스모크(무비용): `POSTDECK_LLM=openai` + 키 없음 → 클린 one-liner(스택 X), 라우팅 검증. 라이브 호출은 사용자가 OPENAI_API_KEY 넣고 확인(패턴은 gemini와 동일하게 라이브 검증됨).
- 회귀 114 green, typecheck·next build 클린.

## 3. 비목표
- 사용자별 런타임 프로바이더/키 선택(UI) — 서비스화 시. 지금은 env 전역.
