import type { ProjectView } from '@postdeck/adapters'
import { VariantBadges } from './VariantBadges.js'

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—')

export function PostList({ project }: { project: ProjectView }) {
  if (project.error) return null
  return (
    <div>
      <h2>{project.name}</h2>
      <table>
        <thead><tr><th>제목</th><th>상태</th><th>발행일</th><th>언어</th></tr></thead>
        <tbody>
          {project.posts.map((post) => (
            <tr key={post.id}>
              <td>{post.liveUrl ? <a href={post.liveUrl} target="_blank" rel="noreferrer">{post.title}</a> : post.title}</td>
              <td><span className={`dot ${post.status}`} />{post.status}</td>
              <td>{fmt(post.publishDate)}</td>
              <td><VariantBadges variants={post.variants} /></td>
            </tr>
          ))}
          {project.posts.length === 0 && <tr><td colSpan={4} className="err">글 없음</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
