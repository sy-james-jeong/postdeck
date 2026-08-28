import Anthropic from '@anthropic-ai/sdk'
import type { LLMClient, LLMRequest } from '@postdeck/core'

// Edge adapter for the LLMClient port. The request params object is typed `any`
// on purpose: `thinking: {type:'adaptive'}` and `output_config.effort` are recent
// API fields that may not exist in the installed SDK's static types. Behavior is
// validated end-to-end in Task 11.
export function createAnthropicLLM(deps: { env: (n: string) => string | undefined }): LLMClient {
  const apiKey = deps.env('ANTHROPIC_API_KEY')
  const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic()
  return {
    async complete(req: LLMRequest): Promise<string> {
      const params: any = {
        model: 'claude-opus-4-8',
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        messages: [{ role: 'user', content: req.prompt }],
      }
      if (req.system) params.system = req.system
      const res = await client.messages.create(params)
      const blocks = res.content as Array<{ type: string; text?: string }>
      return blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
    },
  }
}
