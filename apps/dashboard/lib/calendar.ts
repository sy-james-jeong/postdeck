import type { PostStatus } from '@postdeck/core'
import type { ProjectView } from '@postdeck/adapters'

export interface CalendarEntry {
  date: string
  project: string
  title: string
  status: PostStatus
}

export function toCalendarEntries(projects: ProjectView[]): CalendarEntry[] {
  const entries: CalendarEntry[] = []
  for (const proj of projects) {
    for (const p of proj.posts) {
      if (!p.publishDate) continue
      entries.push({ date: p.publishDate.toISOString().slice(0, 10), project: proj.name, title: p.title, status: p.status })
    }
  }
  return entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
