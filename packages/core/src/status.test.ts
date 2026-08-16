import { expect, test } from 'vitest'
import { normalizeStatus } from './index.js'

const now = new Date('2026-08-16T00:00:00Z')

test('draft flag (boolean) wins', () => {
  expect(normalizeStatus({ draftValue: true, publishDate: new Date('2026-01-01'), now })).toBe('draft')
})
test('status string "draft" (via draftValue) => draft', () => {
  expect(normalizeStatus({ statusValue: 'draft', draftValue: undefined, rule: { draftValue: 'draft' }, publishDate: null, now })).toBe('draft')
})
test('future publishDate + not draft => scheduled', () => {
  expect(normalizeStatus({ publishDate: new Date('2026-12-01'), now })).toBe('scheduled')
})
test('past publishDate + not draft => published', () => {
  expect(normalizeStatus({ publishDate: new Date('2026-01-01'), now })).toBe('published')
})
test('allPublished rule forces published regardless of date', () => {
  expect(normalizeStatus({ publishDate: new Date('2026-12-01'), rule: { allPublished: true }, now })).toBe('published')
})
test('no date, no draft => published', () => {
  expect(normalizeStatus({ publishDate: null, now })).toBe('published')
})
