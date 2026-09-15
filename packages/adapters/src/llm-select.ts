import type { LLMClient } from '@postdeck/core'
import { createGeminiLLM } from './gemini-llm.js'
import { createAnthropicLLM } from './anthropic-llm.js'

export function selectLLM(deps: { env: (n: string) => string | undefined }): LLMClient {
  const provider = deps.env('POSTDECK_LLM') ?? 'gemini'
  if (provider === 'gemini') return createGeminiLLM(deps)
  if (provider === 'anthropic') return createAnthropicLLM(deps)
  throw new Error(`POSTDECK_LLM must be "gemini" or "anthropic", got "${provider}"`)
}
