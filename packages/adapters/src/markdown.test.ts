import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { resolveSource, toPost, type BlogConfig } from '@blogmanager/core'
import './index.js'  // side-effect: registers adapters
import { createLocalFs } from './localfs.js'

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'bm-md-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 't@t.co'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: root })
  mkdirSync(join(root, 'guides'))
  return root
}

// `dir` is repo-relative ('guides'), matching createLocalFs(root) which joins
// all FileStore paths under `root`. This keeps cfg.source.dir and the
// FileStore's rootDir aligned (see task-9 plan wrinkle note).
const cfg = (dir: string): BlogConfig => ({
  id: 'freelance', source: { type: 'markdown', dir },
  fieldMap: { title: 'title', date: 'datePublished', excerpt: 'description' },
  statusRule: { allPublished: true },
})

test('list maps datePublished->date and description->excerpt', async () => {
  const root = repo()
  writeFileSync(join(root, 'guides/a.md'),
    '---\ntitle: A\ndatePublished: "2026-01-01"\ndescription: hey\norder: 2\n---\n\nbody', 'utf8')
  const src = resolveSource(cfg('guides'), { env: () => undefined, fileStore: createLocalFs(root) })
  const raws = await src.list()
  const post = toPost(raws[0], cfg('guides'), new Date('2026-08-16'))
  expect(post.title).toBe('A')
  expect(post.excerpt).toBe('hey')
  expect(post.publishDate?.toISOString().slice(0, 10)).toBe('2026-01-01')
  expect(post.raw.order).toBe(2)   // original preserved through RawPost.raw
})

test('read() throws until L2 implements it', async () => {
  const root = repo()
  const src = resolveSource(cfg('guides'), { env: () => undefined, fileStore: createLocalFs(root) })
  await expect(src.read('anything')).rejects.toThrow(/not implemented/i)
})

test('createDraft writes frontmatter in the project field-map naming', async () => {
  const root = repo()
  const src = resolveSource(cfg('guides'), { env: () => undefined, fileStore: createLocalFs(root) })
  const ref = await src.createDraft({ slug: 'new-post', title: 'New', excerpt: 'sum', body: 'Hello world', date: new Date('2026-09-01') })
  const written = readFileSync(join(root, ref.path!), 'utf8')
  expect(written).toContain('title: New')
  expect(written).toContain('datePublished:')     // uses the mapped key, not "date"
  expect(written).toContain('description: sum')   // uses the mapped key, not "excerpt"
  expect(written).toContain('Hello world')
})
