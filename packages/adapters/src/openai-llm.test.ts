import { expect, test } from 'vitest'
import { createOpenAILLM } from './index.js'

test('createOpenAILLM returns an LLMClient with a complete() function', () => {
  // Lazy client construction means no network/SDK work happens here.
  const llm = createOpenAILLM({ env: (n) => (n === 'OPENAI_API_KEY' ? 'test-dummy' : undefined) })
  expect(typeof llm.complete).toBe('function')
})

test('createOpenAILLM.complete rejects with an API-key error when no key is set (no network)', async () => {
  const llm = createOpenAILLM({ env: () => undefined })
  await expect(llm.complete({ prompt: 'hi' })).rejects.toThrow(/api[\s_-]?key/i)
})

test('createOpenAILLM honors POSTDECK_OPENAI_MODEL override (still returns a client)', () => {
  const llm = createOpenAILLM({ env: (n) => (n === 'OPENAI_API_KEY' ? 'x' : n === 'POSTDECK_OPENAI_MODEL' ? 'gpt-x' : undefined) })
  expect(typeof llm.complete).toBe('function')
})
