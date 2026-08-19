import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from 'vitest'
import { resolveConfigPath, loadBlogsConfig } from './index.js'

test('resolveConfigPath defaults to <cwd>/blogs.config.ts', () => {
  expect(resolveConfigPath('/tmp/proj')).toBe(resolve('/tmp/proj', 'blogs.config.ts'))
})
test('resolveConfigPath honors an explicit path', () => {
  expect(resolveConfigPath('/tmp/proj', 'sub/custom.config.ts')).toBe(resolve('/tmp/proj', 'sub/custom.config.ts'))
})

test('loadBlogsConfig imports a TS config and validates it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bm-cfg-'))
  const file = join(dir, 'blogs.config.ts')
  writeFileSync(file, [
    `import { defineBlogs, markdownSource } from '@postdeck/core'`,
    `export default defineBlogs([`,
    `  { id: 'x', source: markdownSource({ dir: '/tmp/x' }),`,
    `    fieldMap: { title: 'title', date: 'date', excerpt: 'excerpt' } },`,
    `])`,
  ].join('\n'), 'utf8')
  const cfg = await loadBlogsConfig(file)
  expect(cfg).toHaveLength(1)
  expect(cfg[0].id).toBe('x')
  expect(cfg[0].source.type).toBe('markdown')
})

test('loadBlogsConfig rejects an invalid config', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bm-cfg-bad-'))
  const file = join(dir, 'blogs.config.ts')
  writeFileSync(file, `export default [{ id: 123 }]`, 'utf8')
  await expect(loadBlogsConfig(file)).rejects.toThrow()
})
