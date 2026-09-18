import { expect, test } from 'vitest'
import { generateDraft, deAiReview, writeDraft } from './index.js'
import type { LLMClient, GenerateInput, BlogSource, DraftInput } from './index.js'

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

test('writeDraft generates, reviews, and saves the REVISED body via createDraft', async () => {
  const llm = fakeLLM([
    '{"title":"My Post","excerpt":"E","tags":["a"],"body":"However, raw AI body."}', // generate
    'Clean human body.', // rewrite
  ])
  let saved: DraftInput | undefined
  const source: BlogSource = {
    capabilities: { canWrite: true, enforcesFutureDates: false, supportsTranslations: false },
    list: async () => [],
    read: async () => { throw new Error('nope') },
    publish: async () => ({ id: 'stub' }),
    unpublish: async () => ({ id: 'stub' }),
    createDraft: async (input) => { saved = input; return { id: input.slug, path: `x/${input.slug}.md` } },
  }
  const { ref, result } = await writeDraft(INPUT, { llm, source })
  expect(saved?.slug).toBe('my-post')          // slugified title
  expect(saved?.body).toBe('Clean human body.') // revised, not raw
  expect(saved?.title).toBe('My Post')
  expect(ref.path).toBe('x/my-post.md')
  expect(result.report.before.some((f) => f.id === 'overused-connectors')).toBe(true)
})

test('generateDraft parses JSON whose body itself contains a markdown code fence', async () => {
  const body = 'Intro.\n```js\nconst x = 1\n```\nOutro.'
  const json = JSON.stringify({ title: 'T', excerpt: 'E', tags: [], body })
  const llm = fakeLLM(['```json\n' + json + '\n```'])
  const d = await generateDraft(INPUT, llm)
  expect(d.body).toBe(body)
})
