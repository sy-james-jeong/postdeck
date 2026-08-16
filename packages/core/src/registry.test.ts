import { afterEach, expect, test } from 'vitest'
import { registerSource, resolveSource, clearRegistry } from './index.js'
import type { BlogConfig, BlogSource } from './index.js'

afterEach(() => clearRegistry())

const cfg: BlogConfig = {
  id: 'x', source: { type: 'markdown', dir: '/x' },
  fieldMap: { title: 'title', date: 'date', excerpt: 'excerpt' },
}

test('resolveSource dispatches on source.type', () => {
  const fake: BlogSource = {
    capabilities: { canWrite: true, enforcesFutureDates: false, supportsTranslations: false },
    list: async () => [], read: async () => ({ post: {} as any, body: '' }),
    createDraft: async () => ({ id: 'r' }),
  }
  registerSource('markdown', () => fake)
  expect(resolveSource(cfg, { env: () => undefined })).toBe(fake)
})

test('resolveSource throws on unknown type', () => {
  expect(() => resolveSource(cfg, { env: () => undefined })).toThrow(/no adapter registered/i)
})
