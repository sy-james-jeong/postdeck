import { expect, test } from 'vitest'
import { createGeminiLLM } from './index.js'

test('createGeminiLLM returns an LLMClient with a complete() function', () => {
  // Lazy client construction means no network/SDK work happens here.
  const llm = createGeminiLLM({ env: (n) => (n === 'GEMINI_API_KEY' ? 'test-dummy' : undefined) })
  expect(typeof llm.complete).toBe('function')
})
