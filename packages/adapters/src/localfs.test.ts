import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterAll, expect, test } from 'vitest'
import { createLocalFs } from './localfs.js'

const root = mkdtempSync(join(tmpdir(), 'bm-localfs-'))
execFileSync('git', ['init', '-q'], { cwd: root })
execFileSync('git', ['config', 'user.email', 't@t.co'], { cwd: root })
execFileSync('git', ['config', 'user.name', 't'], { cwd: root })

test('write persists content and creates a commit', async () => {
  const fs = createLocalFs(root)
  await fs.write('posts/a.md', 'hello', { message: 'add a' })
  expect(readFileSync(join(root, 'posts/a.md'), 'utf8')).toBe('hello')
  const log = execFileSync('git', ['log', '--oneline'], { cwd: root }).toString()
  expect(log).toContain('add a')
})

test('read returns written content; list finds it', async () => {
  const fs = createLocalFs(root)
  expect(await fs.read('posts/a.md')).toBe('hello')
  expect(await fs.list('posts')).toContain('a.md')
})

test('write rejects a path that escapes rootDir', async () => {
  const fs = createLocalFs(root)
  await expect(fs.write('../escape.md', 'x', { message: 'm' })).rejects.toThrow(/escape/i)
})

test('read rejects a path that escapes rootDir', async () => {
  const fs = createLocalFs(root)
  await expect(fs.read('../x')).rejects.toThrow(/escape/i)
})

test('root store ("/") allows reading an absolute path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bm-root-'))
  writeFileSync(join(dir, 'x.txt'), 'hi', 'utf8')
  const fs = createLocalFs('/')
  expect(await fs.list(dir)).toContain('x.txt')
  expect(await fs.read(join(dir, 'x.txt'))).toBe('hi')
})

test('list returns [] for a missing dir (ENOENT)', async () => {
  const fs = createLocalFs('/')
  expect(await fs.list('/no/such/dir/postdeck-test')).toEqual([])
})
