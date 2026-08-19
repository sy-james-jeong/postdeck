import { getProjects } from '../lib/data.js'
export default async function Page() {
  const projects = await getProjects()
  return <pre>{JSON.stringify(projects.map((p) => ({ id: p.id, counts: p.counts, error: p.error })), null, 2)}</pre>
}
