import { expect, test } from 'vitest'
import { generateDraft, deAiReview } from './index.js'
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

test('deAiReview lints, rewrites, and re-lints', async () => {
  const dirty = 'However, this is great. Moreover, it is fine. Furthermore we go. Additionally, thus done.'
  const clean = 'The tool works. I use it daily. It saved me time. No complaints.'
  const llm = fakeLLM([clean]) // one rewrite call
  const { body, report } = await deAiReview(dirty, llm)
  expect(body).toBe(clean)
  expect(report.before.some((f) => f.id === 'overused-connectors')).toBe(true)
  expect(report.after).toEqual([]) // clean rewrite has no findings
  expect(report.rewriteNote).toMatch(/chars/)
})
