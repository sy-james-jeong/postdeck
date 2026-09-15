# PostDeck — Spec: Gemini LLM provider (default) for `postdeck write`

- **작성일**: 2026-09-14
- **상태**: 설계 확정 → writing-plans 대기
- **목적**: L2 `postdeck write`의 LLM provider로 Google Gemini를 추가하고 기본값으로. 비용 최적화(Gemini Flash가 제일 쌈). `LLMClient` 포트 덕에 파이프라인·린터·CLI 로직은 불변, 어댑터 + 선택 로직만 추가.
- **선행**: `docs/superpowers/specs/2026-08-21-phase3-l2-ai-pipeline-spec.md` (Phase 3 L2).

---

## 0. 현재 상태 (이미 있는 것)

`main`에 병합됨 (Phase 3, merge `e7e38dc`). 72 테스트 통과, typecheck 클린.

- `@postdeck/core`: **순수** (zod-only). `LLMClient` 포트 = `{ complete(req: { system?: string; prompt: string }): Promise<string> }`. 파이프라인(`generateDraft`/`deAiReview`/`writeDraft`)은 `LLMClient`를 주입받음.
- `@postdeck/adapters`: `createAnthropicLLM(deps: { env }): LLMClient` (실 `@anthropic-ai/sdk`, `claude-opus-4-8`). SDK는 adapters에만.
- `apps/cli`: `postdeck write --project --topic [--lang] [--dry-run]`. 현재 `write.ts`가 `createAnthropicLLM`을 **하드코딩**으로 씀. 자격증명 없을 때 친절 에러(`isMissingCredentialError`).

### 0.1 브레인스토밍 확정 결정 (2026-09-14)

1. **provider 선택 = env `POSTDECK_LLM`, 기본 `gemini`.** `gemini`|`anthropic` 둘 다 유지. `createAnthropicLLM`은 그대로 둠.
2. **Gemini 모델 = 표준 Flash `gemini-2.5-flash`** (공식 `@google/genai` README 확인값; 최신 Flash 나오면 id만 교체).
3. **system 프롬프트는 `contents`에 병합** (`${system}\n\n${prompt}`) — `systemInstruction` 필드 형태에 의존하지 않아 SDK 버전에 견고.
4. **키 env = `GEMINI_API_KEY`** (없으면 `GOOGLE_API_KEY` 폴백). SDK는 adapters에만(`@google/genai`), core 순수 유지.
5. per-project provider config는 비목표(YAGNI) — 모든 블로그가 같은 provider면 불필요.

**확인된 `@google/genai` 표면** (공식 README):
```ts
import { GoogleGenAI } from '@google/genai'
const ai = new GoogleGenAI({ apiKey })
const res = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: '<text>' })
res.text // string
```

---

## 1. 범위

### 1.1 Gemini 어댑터 (`@postdeck/adapters`)

```ts
export function createGeminiLLM(deps: { env: (n: string) => string | undefined }): LLMClient
```
- `apiKey = deps.env('GEMINI_API_KEY') ?? deps.env('GOOGLE_API_KEY')`; `new GoogleGenAI({ apiKey })` (키 없으면 그대로 생성 — 실제 호출 시 SDK가 에러; §1.3의 친절 에러가 잡음).
- `complete(req)`: `contents = req.system ? \`${req.system}\n\n${req.prompt}\` : req.prompt`; `await ai.models.generateContent({ model: 'gemini-2.5-flash', contents })`; `return res.text ?? ''`.
- `@google/genai`를 adapters 의존성에 추가. **core엔 추가 금지.**

### 1.2 provider 선택 (`selectLLM`)

```ts
export function selectLLM(deps: { env: (n: string) => string | undefined }): LLMClient
```
- `provider = deps.env('POSTDECK_LLM') ?? 'gemini'`.
- `'gemini'` → `createGeminiLLM(deps)`; `'anthropic'` → `createAnthropicLLM(deps)`; 그 외 → `throw new Error('POSTDECK_LLM must be "gemini" or "anthropic"')`.
- 위치: `@postdeck/adapters` (두 어댑터가 다 여기 있으므로). export.

### 1.3 CLI 배선 (`apps/cli/src/write.ts`)

- `createAnthropicLLM({ env })` 하드코딩을 `selectLLM({ env })`로 교체. 나머지 흐름 불변.
- 친절 에러 메시지를 provider-aware하게: `postdeck write: no LLM credentials. Set GEMINI_API_KEY (or ANTHROPIC_API_KEY) in .env, or run \`ant auth login\`.` `isMissingCredentialError`가 Gemini의 키 누락/무효 에러도 잡도록 정규식 유지·필요시 확장(`api[\s_-]?key`가 "API key not valid" 등 커버).

### 1.4 `.env.example`

추가:
```
# L2 AI writing provider: "gemini" (default, cheapest) or "anthropic"
POSTDECK_LLM=gemini
# Gemini (default provider). Get one at aistudio.google.com.
GEMINI_API_KEY=...
```
(기존 `ANTHROPIC_API_KEY` 줄 유지.)

---

## 2. 불변 / 비목표

- **불변**: `@postdeck/core` 전체(파이프라인/린터/프롬프트/포트), `createAnthropicLLM`, 기존 72 테스트.
- **비목표**: per-project provider config; Gemini 구조화 출력(structured output) API — 파이프라인이 이미 방어적 JSON 파싱(`parseDraftJson`)을 하므로 텍스트 반환으로 충분; systemInstruction 필드 사용(대신 contents 병합); 스트리밍.
- **core 순수성**: `@google/genai`는 adapters에만.

---

## 3. 아키텍처 배치

```
packages/adapters/src/
  gemini-llm.ts       # createGeminiLLM (@google/genai)
  llm-select.ts       # selectLLM (POSTDECK_LLM 분기)  ← 또는 anthropic-llm.ts 옆 파일
  index.ts            # + export createGeminiLLM, selectLLM
  package.json        # + @google/genai
apps/cli/src/write.ts # selectLLM 사용 + provider-aware 에러 메시지
.env.example          # + POSTDECK_LLM, GEMINI_API_KEY
```

---

## 4. 테스트 전략

- **`createGeminiLLM`**: 스모크 — 더미 키(`env: n => 'x'`)로 `{ complete: fn }` 반환(네트워크 X, 생성만). 실제 생성은 수동 검증.
- **`selectLLM`**: `POSTDECK_LLM` 미설정→gemini 경로 객체, `'anthropic'`→anthropic 경로 객체, `'bogus'`→throw. (각 어댑터가 반환하는 객체에 `complete` 함수 존재로 확인; 더미 키로.)
- **`isMissingCredentialError`**: Gemini류 메시지("API key not valid", "Could not resolve authentication")도 true 판정.
- **회귀**: 기존 72 테스트 green. 파이프라인/anthropic 테스트 불변.
- **e2e (라이브)**: `GEMINI_API_KEY` 있으면 `postdeck write --project freelance --topic "..." --dry-run`으로 실제 생성+De-AI before/after 확인. 없으면 wiring(config→tone→prompt→generateContent 직전)까지 검증 + 친절 에러 확인.

---

## 5. OSS / 비용

- 새 런타임 의존 `@google/genai`(adapters만). core는 zod-only 유지.
- 실 키/생성물 커밋 금지(기존 gitignore 커버).
- 기본 provider가 Gemini Flash라 토큰 비용 최소. Anthropic로 전환은 `POSTDECK_LLM=anthropic` 한 줄.

---

## 6. 실행 순서 (writing-plans 입력)

1. **`createGeminiLLM`** + `@google/genai` 의존 + 스모크 테스트.
2. **`selectLLM`** + CLI `write.ts` 배선 교체 + provider-aware 에러 메시지 + `isMissingCredentialError` 확장 + `.env.example`. 테스트: selectLLM 분기, 에러판정.
3. **e2e 검증**: 키 있으면 라이브 dry-run→저장; 없으면 keyless wiring + 친절 에러 확인 + 회귀(72+신규) green.
