import { expect, test } from 'vitest'
import { slugify } from './index.js'

test('slugify lowercases and hyphenates', () => {
  expect(slugify('Hello, World!')).toBe('hello-world')
})
test('slugify collapses whitespace and underscores', () => {
  expect(slugify('  Multiple   Spaces_here  ')).toBe('multiple-spaces-here')
})
test('slugify strips leading/trailing hyphens', () => {
  expect(slugify('— Dashy —')).toBe('dashy')
})
