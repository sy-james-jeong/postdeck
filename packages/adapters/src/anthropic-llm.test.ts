import { expect, test } from 'vitest'
import { createAnthropicLLM } from './index.js'

test('createAnthropicLLM returns an LLMClient with a complete() function', () => {
  // Passing a dummy key lets the SDK client construct without network access.
  const llm = createAnthropicLLM({ env: (n) => (n === 'ANTHROPIC_API_KEY' ? 'sk-test-dummy' : undefined) })
  expect(typeof llm.complete).toBe('function')
})
