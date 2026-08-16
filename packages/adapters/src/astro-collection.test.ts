import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { resolveSource, type BlogConfig } from '@blogmanager/core'
import './index.js'
import { createLocalFs } from './localfs.js'

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
