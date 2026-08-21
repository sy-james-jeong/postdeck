import type { ProjectView } from '@postdeck/adapters'
import { showsUnbuiltScheduledBadge } from '../lib/badges.js'

export function ProjectCard({ project }: { project: ProjectView }) {
  const p = project
  return (
    <div className="card">
      <h3>{p.liveUrl ? <a href={p.liveUrl} target="_blank" rel="noreferrer">{p.name}</a> : p.name}</h3>
      {p.error ? (
        <div className="err">⚠ {p.error}</div>
      ) : (
        <div className="counts">
          <div className="count"><b>{p.counts.published}</b><span>발행</span></div>
          <div className="count">
            <b>{p.counts.scheduled}</b>
            <span>예약{showsUnbuiltScheduledBadge(p.capabilities, p.counts.scheduled) ? ' ' : ''}</span>
            {showsUnbuiltScheduledBadge(p.capabilities, p.counts.scheduled) && (
              <span className="badge warn" title="이 소스의 빌드는 미래 날짜를 실제로 거르지 않습니다">빌드 미반영</span>
            )}
          </div>
          <div className="count"><b>{p.counts.draft}</b><span>초안</span></div>
        </div>
      )}
    </div>
  )
}
