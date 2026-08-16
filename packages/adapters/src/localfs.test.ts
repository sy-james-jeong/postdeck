import { mkdtempSync, readFileSync } from 'node:fs'
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
