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

import { groupByMonth, type CalendarEntry } from './calendar.js'

test('groupByMonth groups sorted entries by month with a KO label', () => {
  const e = (date: string, title: string): CalendarEntry => ({ date, title, project: 'P', status: 'published' })
  const groups = groupByMonth([e('2026-07-11', 'a'), e('2026-07-29', 'b'), e('2026-08-05', 'c')])
  expect(groups.map((g) => g.month)).toEqual(['2026-07', '2026-08'])
  expect(groups[0].label).toBe('2026년 7월')
  expect(groups[0].entries.map((x) => x.title)).toEqual(['a', 'b'])
  expect(groups[1].entries).toHaveLength(1)
})
