import { expect, test } from 'vitest'
import { toCalendarEntries } from './calendar.js'
import type { ProjectView } from '@postdeck/adapters'

const post = (title: string, date: string | null) => ({
  id: title, project: 'p', title, slug: title, status: 'published' as const,
  publishDate: date ? new Date(date) : null, excerpt: '', tags: [] as string[], raw: {},
})
const view = (posts: any[]): ProjectView => ({
  id: 'p', name: 'P', sourceType: 'markdown',
  capabilities: { canWrite: true, enforcesFutureDates: false, supportsTranslations: false },
  posts, counts: { draft: 0, scheduled: 0, published: posts.length },
})

test('toCalendarEntries drops null dates and sorts ascending by date', () => {
  const entries = toCalendarEntries([view([post('B', '2026-05-01'), post('A', '2026-01-01'), post('N', null)])])
  expect(entries.map((e) => e.title)).toEqual(['A', 'B'])
  expect(entries[0]).toEqual({ date: '2026-01-01', project: 'P', title: 'A', status: 'published' })
})
