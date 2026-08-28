import { expect, test } from 'vitest'
import { generateDraft } from './index.js'
import type { LLMClient, GenerateInput } from './index.js'

const INPUT: GenerateInput = {
  project: 'p',
  topic: 't',
  toneContext: { projectName: 'P', samples: [{ title: 'A', snippet: 's' }] },
}
const fakeLLM = (responses: string[]): LLMClient => {
  let i = 0
  return { complete: async () => responses[i++] ?? '' }
}

test('generateDraft parses a JSON draft (fenced)', async () => {
  const llm = fakeLLM(['```json\n{"title":"T","excerpt":"E","tags":["x"],"body":"B"}\n```'])
  const d = await generateDraft(INPUT, llm)
  expect(d).toEqual({ title: 'T', excerpt: 'E', tags: ['x'], body: 'B' })
})

test('generateDraft parses bare JSON and defaults missing excerpt/tags', async () => {
  const llm = fakeLLM(['{"title":"T","body":"B"}'])
  const d = await generateDraft(INPUT, llm)
  expect(d).toEqual({ title: 'T', excerpt: '', tags: [], body: 'B' })
})

test('generateDraft throws on non-JSON output', async () => {
  const llm = fakeLLM(['not json at all'])
  await expect(generateDraft(INPUT, llm)).rejects.toThrow(/valid JSON/)
})
