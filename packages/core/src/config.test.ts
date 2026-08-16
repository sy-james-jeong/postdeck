import { expect, test } from 'vitest'
import { blogsConfigSchema, defineBlogs, notionSource, markdownSource } from './index.js'

test('defineBlogs returns plain JSON-serializable data (no functions)', () => {
  const cfg = defineBlogs([
    { id: 'hongix', name: 'Hongix', liveUrl: 'https://hongix.com/blog',
      source: notionSource({ databaseId: 'db1', tokenRef: 'HONGIX_NOTION_TOKEN' }),
      fieldMap: { title: 'title', date: 'date', status: 'status', excerpt: 'excerpt', tags: 'tags' } },
  ])
  // Round-trips through JSON unchanged => contains no closures.
  expect(JSON.parse(JSON.stringify(cfg))).toEqual(cfg)
  expect(cfg[0].source).toEqual({ type: 'notion', databaseId: 'db1', tokenRef: 'HONGIX_NOTION_TOKEN' })
})

test('zod validates a good config and rejects an unknown source type', () => {
  const good = defineBlogs([
    { id: 'freelance', source: markdownSource({ dir: '/x/guides' }),
      fieldMap: { title: 'title', date: 'datePublished', excerpt: 'description' },
      statusRule: { allPublished: true } },
  ])
  expect(blogsConfigSchema.safeParse(good).success).toBe(true)
  const bad = [{ id: 'z', source: { type: 'ftp' }, fieldMap: { title: 't', date: 'd', excerpt: 'e' } }]
  expect(blogsConfigSchema.safeParse(bad).success).toBe(false)
})
