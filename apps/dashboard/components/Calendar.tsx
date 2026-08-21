import type { ProjectView } from '@postdeck/adapters'
import { toCalendarEntries } from '../lib/calendar.js'

export function Calendar({ projects }: { projects: ProjectView[] }) {
  const entries = toCalendarEntries(projects)
  if (entries.length === 0) return <p className="err">날짜가 있는 글이 없습니다.</p>
  return (
    <div className="cal">
      {entries.map((e, i) => (
        <span key={`${e.date}-${e.project}-${e.title}-${i}`} className="entry" title={`${e.project} · ${e.status}`}>
          <span className="d">{e.date}</span> <span className={`dot ${e.status}`} />{e.title}
        </span>
      ))}
    </div>
  )
}
