import { expect, test } from 'vitest'
import { selectLLM } from './index.js'

// Dummy keys keep the underlying factories from caring about real credentials;
// selectLLM only needs to return the right client shape per POSTDECK_LLM.
const withEnv = (map: Record<string, string>) => ({ env: (n: string) => map[n] })

test('selectLLM defaults to gemini when POSTDECK_LLM is unset', () => {
  const llm = selectLLM(withEnv({ GEMINI_API_KEY: 'x' }))
  expect(typeof llm.complete).toBe('function')
})
test('selectLLM returns anthropic when POSTDECK_LLM=anthropic', () => {
  const llm = selectLLM(withEnv({ POSTDECK_LLM: 'anthropic', ANTHROPIC_API_KEY: 'x' }))
  expect(typeof llm.complete).toBe('function')
})
test('selectLLM throws on an unknown provider', () => {
  expect(() => selectLLM(withEnv({ POSTDECK_LLM: 'bogus' }))).toThrow(/POSTDECK_LLM/)
})
