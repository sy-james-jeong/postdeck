import { expect, test } from 'vitest'
import type { BlogSource, RawPost } from '@postdeck/core'
import { gatherToneContext } from './index.js'

const raws: RawPost[] = [
  { id: 'a', slug: 'a', fields: { title: 'A', excerpt: 'exc-a' }, raw: {} },
  { id: 'b', slug: 'b', fields: { title: 'B', excerpt: 'exc-b' }, raw: {} },
]
const base = { capabilities: { canWrite: true, enforcesFutureDates: false, supportsTranslations: false }, list: async () => raws, createDraft: async () => ({ id: 'x' }) }
const cfg = { id: 'p', name: 'P', source: { type: 'markdown', dir: 'd' }, fieldMap: { title: 'title', date: 'date', excerpt: 'excerpt' } } as any

test('gatherToneContext uses body snippets when read() works', async () => {
  const source: BlogSource = { ...base, read: async (id) => ({ post: {} as any, body: `body-of-${id}` }) }
  const tone = await gatherToneContext(source, cfg)
  expect(tone.projectName).toBe('P')
  expect(tone.samples[0]).toEqual({ title: 'A', snippet: 'body-of-a' })
})

test('gatherToneContext falls back to excerpt when read() throws (notion)', async () => {
  const source: BlogSource = { ...base, read: async () => { throw new Error('not implemented until L2') } }
  const tone = await gatherToneContext(source, cfg)
  expect(tone.samples[0]).toEqual({ title: 'A', snippet: 'exc-a' })
})

test('gatherToneContext respects max', async () => {
  const source: BlogSource = { ...base, read: async (id) => ({ post: {} as any, body: id }) }
  const tone = await gatherToneContext(source, cfg, { max: 1 })
  expect(tone.samples).toHaveLength(1)
})
