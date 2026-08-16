import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { expect, test } from 'vitest'
import { parseFrontmatter, patchFrontmatter } from './frontmatter.js'

const here = dirname(fileURLToPath(import.meta.url))
const raw = readFileSync(join(here, '__fixtures__/freelance-guide.md'), 'utf8')

test('parse reads nested maps and lists', () => {
  const { data, body } = parseFrontmatter(raw)
  expect(data.title).toContain('Freelancer tax by province')
  expect((data.shortAnswer as any).big).toBe('About 26 to 31 percent')
  expect(data.tags).toEqual(['tax', 'canada'])
  expect(body.trimStart().startsWith('Federal tax')).toBe(true)
})

test('no-op patch is a byte-for-byte round trip (diff == 0)', () => {
  expect(patchFrontmatter(raw, {})).toBe(raw)
})

test('patching one key preserves every unmapped key, order, and the nested map', () => {
  const out = patchFrontmatter(raw, { description: 'NEW DESC' })
  const { data } = parseFrontmatter(out)
  expect(data.description).toBe('NEW DESC')
  // untouched fields survive
  expect(data.order).toBe(4)
  expect((data.shortAnswer as any).label).toBe('The short answer')
  expect(data.ctaHeading).toBe("See your province's number")
  // key order unchanged: slug still before order still before title
  expect(out.indexOf('slug:')).toBeLessThan(out.indexOf('order:'))
  expect(out.indexOf('order:')).toBeLessThan(out.indexOf('title:'))
  // body untouched
  expect(out).toContain('## How we ranked these')
})
