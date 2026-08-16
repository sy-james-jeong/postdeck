import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { expect, test } from 'vitest'
import { resolveSource, toPost, type BlogConfig } from '@blogmanager/core'
import './index.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(here, '__fixtures__/notion-query.json'), 'utf8')

const cfg: BlogConfig = {
  id: 'hongix', liveUrl: 'https://hongix.com/blog',
  source: { type: 'notion', databaseId: 'db1', tokenRef: 'HONGIX_NOTION_TOKEN' },
  fieldMap: { title: 'Title', date: 'Date', excerpt: 'Excerpt', status: 'Status', tags: 'Tags', slug: 'Slug' },
  statusRule: { draftValue: 'draft' },
}

test('list maps Notion properties to canonical fields', async () => {
  const fakeFetch = (async () => new Response(fixture, { status: 200 })) as unknown as typeof fetch
  const src = resolveSource(cfg, { env: (n) => (n === 'HONGIX_NOTION_TOKEN' ? 'secret' : undefined), fetchImpl: fakeFetch })
  const raws = await src.list()
  const post = toPost(raws[0], cfg, new Date('2026-08-16'))
  expect(post.title).toBe('Shipping fast')
  expect(post.slug).toBe('shipping-fast')
  expect(post.excerpt).toBe('Notes')
  expect(post.tags).toEqual(['design'])
  expect(post.status).toBe('published')
  expect(post.liveUrl).toBe('https://hongix.com/blog/shipping-fast')
})

test('missing token throws a clear error', () => {
  expect(() => resolveSource(cfg, { env: () => undefined })).toThrow(/HONGIX_NOTION_TOKEN/)
})
