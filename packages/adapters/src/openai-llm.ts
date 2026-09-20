import OpenAI from 'openai'
import type { LLMClient, LLMRequest } from '@postdeck/core'

// Edge adapter for the LLMClient port, backed by OpenAI (ChatGPT models).
// Mirrors the Gemini adapter: the client is constructed lazily inside complete()
// so a missing/invalid-key error surfaces at call time (inside the CLI's
// try/catch), and we guard the missing-key case explicitly so the CLI shows a
// clean one-liner (matching its isMissingCredentialError regex) instead of the
// SDK's own error. The model id is env-overridable since OpenAI rotates model
// names over time.
export function createOpenAILLM(deps: { env: (n: string) => string | undefined }): LLMClient {
  const apiKey = deps.env('OPENAI_API_KEY')
  const model = deps.env('POSTDECK_OPENAI_MODEL') ?? 'gpt-4o-mini'
  return {
    async complete(req: LLMRequest): Promise<string> {
      if (!apiKey) throw new Error('OpenAI: OPENAI_API_KEY is not set')
      const client = new OpenAI({ apiKey })
      const messages: Array<{ role: 'system' | 'user'; content: string }> = []
      if (req.system) messages.push({ role: 'system', content: req.system })
      messages.push({ role: 'user', content: req.prompt })
      const res = await client.chat.completions.create({ model, messages })
      return res.choices[0]?.message?.content ?? ''
    },
  }
}
