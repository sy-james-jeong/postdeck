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
