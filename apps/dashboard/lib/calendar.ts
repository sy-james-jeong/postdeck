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

export interface CalendarMonth {
  month: string // YYYY-MM
  label: string // e.g. "2026년 7월"
  entries: CalendarEntry[]
}

// Group already-sorted entries into months (chronological), for a timeline view.
export function groupByMonth(entries: CalendarEntry[]): CalendarMonth[] {
  const byMonth = new Map<string, CalendarEntry[]>()
  for (const e of entries) {
    const m = e.date.slice(0, 7)
    const arr = byMonth.get(m) ?? []
    arr.push(e)
    byMonth.set(m, arr)
  }
  return [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, es]) => {
      const [y, mm] = month.split('-')
      return { month, label: `${y}년 ${Number(mm)}월`, entries: es }
    })
}
