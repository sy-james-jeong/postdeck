import type { ProjectView } from '@postdeck/adapters'
import { toCalendarEntries, groupByMonth } from '../lib/calendar.js'

export function Calendar({ projects }: { projects: ProjectView[] }) {
  const entries = toCalendarEntries(projects)
  if (entries.length === 0) return <p className="err">날짜가 있는 글이 없습니다.</p>
  const months = groupByMonth(entries)
  return (
    <div className="timeline">
      {months.map((m) => (
        <section key={m.month} className="tl-month">
          <h3 className="tl-mlabel">{m.label}</h3>
          <div className="cal">
            {m.entries.map((e, i) => (
              <span key={`${e.date}-${e.project}-${e.title}-${i}`} className="entry" title={`${e.project} · ${e.status}`}>
                <span className={`dot ${e.status}`} /> <span className="d">{e.date.slice(5)}</span> {e.title}
                <span className="tl-proj">{e.project}</span>
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
