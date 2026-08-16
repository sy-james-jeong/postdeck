import { expect, test } from 'vitest'
import { toPost } from './index.js'
import type { BlogConfig } from './index.js'

const cfg: BlogConfig = {
  id: 'freelance', liveUrl: 'https://logbill.com/guides',
  source: { type: 'markdown', dir: '/x' },
  fieldMap: { title: 'title', date: 'datePublished', excerpt: 'description' },
  statusRule: { allPublished: true },
}
const now = new Date('2026-08-16T00:00:00Z')

test('maps canonical fields, applies allPublished status and liveUrl', () => {
  const post = toPost({
    id: 'freelancer-tax', slug: 'freelancer-tax',
    fields: { title: 'Tax', date: '2026-12-01', excerpt: 'How much', tags: undefined },
    raw: { title: 'Tax', order: 4, datePublished: '2026-12-01' },
  }, cfg, now)
  expect(post.project).toBe('freelance')
  expect(post.title).toBe('Tax')
  expect(post.status).toBe('published')                // allPublished beats future date
  expect(post.publishDate?.toISOString().slice(0, 10)).toBe('2026-12-01')
  expect(post.liveUrl).toBe('https://logbill.com/guides/freelancer-tax')
  expect(post.raw.order).toBe(4)                        // untouched original preserved
})
