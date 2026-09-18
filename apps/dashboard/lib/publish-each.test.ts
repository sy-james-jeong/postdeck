import { expect, test } from 'vitest'
import type { BlogSource } from '@postdeck/core'
import { publishEach } from './write.js'

const fakeSource = (failIds: string[]): BlogSource => ({
  capabilities: { canWrite: true, enforcesFutureDates: false, supportsTranslations: false },
  list: async () => [],
  read: async () => ({ post: {} as any, body: '' }),
  createDraft: async () => ({ id: 'x' }),
  publish: async (id) => {
    if (failIds.includes(id)) throw new Error(`boom ${id}`)
    return { id, path: `p/${id}.md` }
  },
  unpublish: async () => ({ id: 'x' }),
})

test('publishEach publishes every id and returns per-id refs', async () => {
  const r = await publishEach(fakeSource([]), ['a', 'b'])
  expect(r).toEqual([
    { id: 'a', ok: true, ref: { id: 'a', path: 'p/a.md' } },
    { id: 'b', ok: true, ref: { id: 'b', path: 'p/b.md' } },
  ])
})

test('publishEach isolates a failing id and still processes the rest', async () => {
  const r = await publishEach(fakeSource(['b']), ['a', 'b', 'c'])
  expect(r.map((x) => x.ok)).toEqual([true, false, true])
  expect(r[1].error).toMatch(/boom b/)
})

test('publishEach on empty input returns []', async () => {
  expect(await publishEach(fakeSource([]), [])).toEqual([])
})
