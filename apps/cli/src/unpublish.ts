import { resolve } from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { resolveSource } from '@postdeck/core'
import { resolveConfigPath, loadBlogsConfig, createLocalFs, deployProject, gitToplevel } from '@postdeck/adapters'

export interface UnpublishArgs {
  project?: string
  slug?: string
  deploy: boolean
  config?: string
}

export function parseUnpublishArgs(argv: string[]): UnpublishArgs {
  const out: UnpublishArgs = { project: undefined, slug: undefined, deploy: false, config: undefined }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--project') out.project = argv[++i]
    else if (a === '--slug') out.slug = argv[++i]
    else if (a === '--deploy') out.deploy = true
    else if (a === '--config') out.config = argv[++i]
  }
  return out
}

export async function runUnpublish(argv: string[]): Promise<void> {
  const args = parseUnpublishArgs(argv)
  const cwd = process.cwd()
  loadDotenv({ path: resolve(cwd, '.env') })

  if (!args.project || !args.slug) {
    console.error('postdeck unpublish: --project <id> and --slug <slug> are required')
    process.exit(1)
  }

  const config = await loadBlogsConfig(resolveConfigPath(cwd, args.config))
  const cfg = config.find((b) => b.id === args.project)
  if (!cfg) {
    console.error(`postdeck unpublish: no project "${args.project}" in config. Available: ${config.map((b) => b.id).join(', ')}`)
    process.exit(1)
  }

  const env = (n: string) => process.env[n]
  const source = resolveSource(cfg, { fileStore: createLocalFs('/'), env, fetchImpl: fetch })
  const raws = await source.list()
  const target = raws.find((r) => r.slug === args.slug || r.id === args.slug)
  if (!target) {
    console.error(`postdeck unpublish: no post with slug "${args.slug}" in project "${args.project}"`)
    process.exit(1)
  }

  const ref = await source.unpublish(target.id)
  console.log(`unpublished: ${ref.path ?? ref.url ?? ref.id}`)

  if (!args.deploy) {
    console.log('(local flip only — pass --deploy to git push and take it off live)')
    return
  }

  // Deploy = git push. For file-based sources the flip already committed; for
  // notion the flip touched no git, so make an empty commit to trigger CI.
  const isFile = cfg.source.type === 'markdown' || cfg.source.type === 'astro-collection'
  const repoDir = cfg.repoDir ?? (isFile ? gitToplevel((cfg.source as { dir: string }).dir) : undefined)
  if (!repoDir) {
    console.error(`postdeck unpublish: --deploy needs a git repo. Set "repoDir" for project "${args.project}".`)
    process.exit(1)
  }
  await deployProject(repoDir, { emptyCommit: !isFile, message: `unpublish: ${args.slug}` })
  console.log(`deployed: git push (${repoDir})`)
}
