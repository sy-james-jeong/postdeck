import { getProjects } from '../lib/data.js'
import { ProjectCard } from '../components/ProjectCard.js'
import { Calendar } from '../components/Calendar.js'
import { PostList } from '../components/PostList.js'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const projects = await getProjects()
  return (
    <main>
      <header className="topbar">
        <div>
          <h1>PostDeck</h1>
          <p className="subtitle">여러 블로그를 한 곳에서 — 발행·예약·초안 현황과 AI 초안 작성</p>
        </div>
        <a className="btn-primary" href="/write">✍ 새 글 쓰기</a>
      </header>

      <h2>프로젝트</h2>
      <div className="cards">
        {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
      </div>

      <h2>타임라인</h2>
      <p className="legend">
        <span className="dot published" /> 발행
        <span className="dot scheduled" /> 예약
        <span className="dot draft" /> 초안
      </p>
      <Calendar projects={projects} />

      <h2>글 목록</h2>
      {projects.map((p) => <PostList key={p.id} project={p} />)}
    </main>
  )
}
