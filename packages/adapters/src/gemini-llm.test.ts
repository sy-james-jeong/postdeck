import { expect, test } from 'vitest'
import { createGeminiLLM } from './index.js'

test('createGeminiLLM returns an LLMClient with a complete() function', () => {
  // Lazy client construction means no network/SDK work happens here.
  const llm = createGeminiLLM({ env: (n) => (n === 'GEMINI_API_KEY' ? 'test-dummy' : undefined) })
  expect(typeof llm.complete).toBe('function')
})

test('createGeminiLLM.complete rejects with an API-key error when no key is set (no network)', async () => {
  const llm = createGeminiLLM({ env: () => undefined })
  await expect(llm.complete({ prompt: 'hi' })).rejects.toThrow(/api[\s_-]?key/i)
})

test('createGeminiLLM honors POSTDECK_GEMINI_MODEL override (still returns a client)', () => {
  const llm = createGeminiLLM({ env: (n) => (n === 'GEMINI_API_KEY' ? 'x' : n === 'POSTDECK_GEMINI_MODEL' ? 'gemini-x' : undefined) })
  expect(typeof llm.complete).toBe('function')
})
