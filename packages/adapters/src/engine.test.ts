import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { defineBlogs, markdownSource, notionSource } from '@postdeck/core'
import { loadPosts, loadProjects, createLocalFs } from './index.js'

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

test('loadProjects returns per-project counts and capabilities', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-proj-'))
  mkdirSync(join(root, 'guides'), { recursive: true })
  writeFileSync(join(root, 'guides/a.md'), '---\ntitle: A\ndatePublished: "2026-01-01"\ndescription: d\n---\nx', 'utf8')
  writeFileSync(join(root, 'guides/b.md'), '---\ntitle: B\ndatePublished: "2026-12-01"\ndescription: d\n---\nx', 'utf8')
  const config = defineBlogs([{
    id: 'freelance', name: 'Freelance', liveUrl: 'https://x.com/blog',
    source: markdownSource({ dir: 'guides' }),
    fieldMap: { title: 'title', date: 'datePublished', excerpt: 'description' },
    statusRule: { allPublished: true },
  }])
  // NOTE: use createLocalFs(root) with a RELATIVE dir here (same pattern as the
  // existing loadPosts test). The '/'-root store is introduced in Task 2, not here.
  const views = await loadProjects(config, { env: () => undefined, fileStore: createLocalFs(root) }, new Date('2026-08-16'))
  expect(views).toHaveLength(1)
  expect(views[0].id).toBe('freelance')
  expect(views[0].name).toBe('Freelance')
  expect(views[0].sourceType).toBe('markdown')
  expect(views[0].capabilities.enforcesFutureDates).toBe(false)
  // allPublished forces both to published regardless of the future date
  expect(views[0].counts).toEqual({ draft: 0, scheduled: 0, published: 2 })
  expect(views[0].error).toBeUndefined()
})

test('loadProjects isolates a failing project instead of throwing', async () => {
  const config = defineBlogs([{
    id: 'broken', source: notionSource({ databaseId: 'db', tokenRef: 'MISSING_TOKEN' }),
    fieldMap: { title: 'title', date: 'date', excerpt: 'excerpt' },
  }])
  const views = await loadProjects(config, { env: () => undefined }, new Date('2026-08-16'))
  expect(views).toHaveLength(1)
  expect(views[0].error).toMatch(/MISSING_TOKEN/)
  expect(views[0].posts).toEqual([])
  expect(views[0].counts).toEqual({ draft: 0, scheduled: 0, published: 0 })
})
