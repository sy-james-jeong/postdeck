import { loadProjects, loadBlogsConfig, resolveConfigPath, createLocalFs, type ProjectView } from '@postdeck/adapters'

// Server-only: reads local files (any repo) and Notion tokens.
// A filesystem-root store lets each blog use its own absolute path across repos.
export async function getProjects(): Promise<ProjectView[]> {
  const configPath = resolveConfigPath(process.cwd(), process.env.POSTDECK_CONFIG)
  const config = await loadBlogsConfig(configPath)
  const deps = {
    fileStore: createLocalFs('/'),
    env: (name: string) => process.env[name],
    fetchImpl: fetch,
  }
  return loadProjects(config, deps)
}
