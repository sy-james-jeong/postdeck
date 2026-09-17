import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { expect, test } from 'vitest'
import { resolveSource, toPost, type BlogConfig } from '@postdeck/core'
import { notionFactory } from './notion.js'
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

test('notion read() returns post + markdown body (paginated blocks)', async () => {
  const page = {
    object: 'page', id: 'p1',
    properties: {
      Title: { type: 'title', title: [{ plain_text: 'Hello' }] },
      Slug: { type: 'rich_text', rich_text: [{ plain_text: 'hello' }] },
    },
  }
  const page1 = { object: 'list', results: [{ type: 'heading_1', heading_1: { rich_text: [{ plain_text: 'Intro' }] } }], has_more: true, next_cursor: 'c2' }
  const page2 = { object: 'list', results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Body text.' }] } }], has_more: false }
  const fetchImpl = (async (url: string) => {
    if (!url.includes('/blocks/')) return { json: async () => page } as any
    return { json: async () => (url.includes('start_cursor=c2') ? page2 : page1) } as any
  }) as unknown as typeof fetch

  const src = notionFactory(
    { id: 'h', source: { type: 'notion', databaseId: 'db', tokenRef: 'T' }, fieldMap: { title: 'Title', date: 'Date', excerpt: 'Excerpt', slug: 'Slug' } } as any,
    { env: (n) => (n === 'T' ? 'tok' : undefined), fetchImpl },
  )
  const { post, body } = await src.read('p1')
  expect(post.title).toBe('Hello')
  expect(body).toContain('# Intro')
  expect(body).toContain('Body text.')
})
