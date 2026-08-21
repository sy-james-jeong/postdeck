import { getProjects } from '../lib/data.js'
import { ProjectCard } from '../components/ProjectCard.js'
import { Calendar } from '../components/Calendar.js'
import { PostList } from '../components/PostList.js'

export const dynamic = 'force-dynamic'  // always read fresh from disk/Notion

export default async function Page() {
  const projects = await getProjects()
  return (
    <main>
      <h1>PostDeck</h1>
      <h2>프로젝트</h2>
      <div className="cards">
        {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
      </div>
      <h2>캘린더</h2>
      <Calendar projects={projects} />
      <h2>글 목록</h2>
      {projects.map((p) => <PostList key={p.id} project={p} />)}
    </main>
  )
}
