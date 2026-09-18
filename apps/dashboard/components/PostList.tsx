import type { ProjectView } from '@postdeck/adapters'
import { PostTable } from './PostTable.js'

// Server wrapper: hides errored projects, then hands the (serializable) view to the
// client PostTable, which owns row rendering + multi-select bulk publish.
export function PostList({ project }: { project: ProjectView }) {
  if (project.error) return null
  return <PostTable project={project} />
}
