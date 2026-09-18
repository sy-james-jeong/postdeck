import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { resolveSource, type BlogConfig } from '@postdeck/core'
import './index.js'
import { createLocalFs } from './localfs.js'
import { astroCollectionFactory } from './astro-collection.js'

const cfg: BlogConfig = {
  id: 'reamly', source: { type: 'astro-collection', dir: 'blog', langs: ['en', 'ko'] },
  fieldMap: { title: 'title', date: 'date', draft: 'draft', excerpt: 'description' },
  groupTranslationsBy: 'slug',
}

test('list walks lang folders and tags each RawPost with its lang', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-astro-'))
  mkdirSync(join(root, 'blog/en'), { recursive: true })
  mkdirSync(join(root, 'blog/ko'), { recursive: true })
  writeFileSync(join(root, 'blog/en/merge.md'), '---\ntitle: Merge\ndate: 2026-07-29\ndraft: false\ndescription: d\n---\nx', 'utf8')
  writeFileSync(join(root, 'blog/ko/merge.md'), '---\ntitle: 병합\ndate: 2026-07-29\ndraft: true\ndescription: d\n---\nx', 'utf8')
  const src = resolveSource(cfg, { env: () => undefined, fileStore: createLocalFs(root) })
  const raws = await src.list()
  expect(raws.map((r) => r.id).sort()).toEqual(['en/merge', 'ko/merge'])
  expect(raws.find((r) => r.lang === 'ko')!.fields.draft).toBe(true)
  expect(src.capabilities.supportsTranslations).toBe(true)
})

test('astro read() returns post + body for lang/slug (.md and .mdx)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-astroread-'))
  mkdirSync(join(root, 'blog/en'), { recursive: true })
  writeFileSync(join(root, 'blog/en/post-a.md'), '---\ntitle: A\ndate: "2026-01-01"\ndescription: d\n---\nAlpha body.\n', 'utf8')
  writeFileSync(join(root, 'blog/en/post-b.mdx'), '---\ntitle: B\ndate: "2026-01-01"\ndescription: d\n---\nBeta body.\n', 'utf8')
  const src = astroCollectionFactory(
    { id: 'r', source: { type: 'astro-collection', dir: 'blog', langs: ['en'] }, fieldMap: { title: 'title', date: 'date', excerpt: 'description' } } as any,
    { env: () => undefined, fileStore: createLocalFs(root) },
  )
  expect((await src.read('en/post-a')).body).toContain('Alpha body.')
  expect((await src.read('en/post-b')).body).toContain('Beta body.')
})

test('astro publish() sets draft:false, preserves other frontmatter', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-astropub-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 't@t.co'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: root })
  mkdirSync(join(root, 'blog/en'), { recursive: true })
  writeFileSync(join(root, 'blog/en/d.md'), '---\ntitle: D\ndraft: true\ntool: merge\n---\nHi.\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '-qm', 'initial'], { cwd: root })
  const src = astroCollectionFactory(
    { id: 'r', source: { type: 'astro-collection', dir: 'blog', langs: ['en'] }, fieldMap: { title: 'title', date: 'date', excerpt: 'description', draft: 'draft' } } as any,
    { env: () => undefined, fileStore: createLocalFs(root) },
  )
  await src.publish('en/d')
  const after = readFileSync(join(root, 'blog/en/d.md'), 'utf8')
  expect(after).toMatch(/draft: false/)
  expect(after).toContain('tool: merge')
})

test('astro unpublish() sets draft:true, preserves other frontmatter', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bm-astrounpub-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 't@t.co'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: root })
  mkdirSync(join(root, 'blog/en'), { recursive: true })
  writeFileSync(join(root, 'blog/en/d.md'), '---\ntitle: D\ndraft: false\ntool: merge\n---\nHi.\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '-qm', 'initial'], { cwd: root })
  const src = astroCollectionFactory(
    { id: 'r', source: { type: 'astro-collection', dir: 'blog', langs: ['en'] }, fieldMap: { title: 'title', date: 'date', excerpt: 'description', draft: 'draft' } } as any,
    { env: () => undefined, fileStore: createLocalFs(root) },
  )
  await src.unpublish('en/d')
  const after = readFileSync(join(root, 'blog/en/d.md'), 'utf8')
  expect(after).toMatch(/draft: true/)
  expect(after).toContain('tool: merge')
})
