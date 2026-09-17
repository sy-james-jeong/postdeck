import { listWritableProjects } from '../../lib/write.js'
import { WriteForm } from '../../components/WriteForm.js'

export const dynamic = 'force-dynamic'

export default async function WritePage() {
  const projects = await listWritableProjects()
  return (
    <main>
      <h1>PostDeck — Write</h1>
      <p><a href="/">← dashboard</a></p>
      <WriteForm projects={projects} />
    </main>
  )
}
