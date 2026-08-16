import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { defineBlogs, markdownSource } from '@blogmanager/core'
import { loadPosts, createLocalFs } from './index.js'

test('loadPosts returns normalized posts keyed by project', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-eng-'))
  mkdirSync(join(root, 'guides'), { recursive: true })
  writeFileSync(join(root, 'guides/a.md'), '---\ntitle: A\ndatePublished: "2026-01-01"\ndescription: d\n---\nx', 'utf8')
  const config = defineBlogs([{
    id: 'freelance', source: markdownSource({ dir: 'guides' }),
    fieldMap: { title: 'title', date: 'datePublished', excerpt: 'description' },
    statusRule: { allPublished: true },
  }])
  const posts = await loadPosts(config, { env: () => undefined, fileStore: createLocalFs(root) }, new Date('2026-08-16'))
  expect(posts.freelance).toHaveLength(1)
  expect(posts.freelance[0].title).toBe('A')
  expect(posts.freelance[0].status).toBe('published')
})
