import { expect, test } from 'vitest'
import { groupTranslations } from './index.js'
import type { Post } from './index.js'

const mk = (slug: string, lang: string, status: Post['status']): Post => ({
  id: `${lang}/${slug}`, project: 'reamly', title: `${slug} (${lang})`, slug, status,
  publishDate: new Date('2026-07-29'), excerpt: '', tags: [], raw: {},
  variants: [{ lang, status, publishDate: new Date('2026-07-29'), present: true }],
})

test('groups same-slug posts and marks missing langs absent', () => {
  const grouped = groupTranslations([mk('merge-pdf', 'en', 'published'), mk('merge-pdf', 'ko', 'draft')], ['en', 'ko', 'ja', 'id'])
  expect(grouped).toHaveLength(1)
  const v = grouped[0].variants!
  expect(v.find((x) => x.lang === 'en')!.present).toBe(true)
  expect(v.find((x) => x.lang === 'ko')!.status).toBe('draft')
  expect(v.find((x) => x.lang === 'ja')!.present).toBe(false)
  expect(v.find((x) => x.lang === 'id')!.present).toBe(false)
})

test('primary is the first present lang in langs order; absent langs get full absent shape', () => {
  const mk = (lang: string, slug: string, title: string) => ({
    id: `${lang}/${slug}`, project: 'reamly', title, slug,
    status: 'published' as const, publishDate: new Date('2026-01-01'),
    excerpt: '', tags: [] as string[], raw: {},
    variants: [{ lang, status: 'published' as const, publishDate: new Date('2026-01-01'), present: true }],
  })
  // langs order ['en','ko','ja'] but only ko+ja present -> primary should be ko (first present in order)
  const grouped = groupTranslations([mk('ja', 's', 'JA'), mk('ko', 's', 'KO')], ['en', 'ko', 'ja'])
  expect(grouped).toHaveLength(1)
  expect(grouped[0].title).toBe('KO')
  const en = grouped[0].variants!.find((v) => v.lang === 'en')!
  expect(en).toEqual({ lang: 'en', status: 'draft', publishDate: null, present: false })
})
