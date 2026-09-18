import { expect, test } from 'vitest'
import { selectDuePosts } from './schedule.js'
import type { Post } from './post.js'

const p = (over: Partial<Post>): Post => ({
  id: 'x', project: 'pr', title: 'T', slug: 'x', status: 'draft',
  publishDate: null, excerpt: '', tags: [], raw: {}, ...over,
})

const NOW = new Date('2026-09-18T00:00:00Z')

test('selects drafts whose publish date has arrived', () => {
  const due = p({ id: 'due', publishDate: new Date('2026-09-17T00:00:00Z') })
  const exactly = p({ id: 'now', publishDate: NOW })
  const future = p({ id: 'future', publishDate: new Date('2026-12-01T00:00:00Z') })
  const undated = p({ id: 'undated', publishDate: null })
  const result = selectDuePosts([due, exactly, future, undated], NOW)
  expect(result.map((x) => x.id)).toEqual(['due', 'now'])
})

test('never selects non-draft posts, even if past-dated', () => {
  const published = p({ id: 'pub', status: 'published', publishDate: new Date('2020-01-01') })
  const scheduledLive = p({ id: 'sch', status: 'scheduled', publishDate: new Date('2020-01-01') })
  expect(selectDuePosts([published, scheduledLive], NOW)).toEqual([])
})
