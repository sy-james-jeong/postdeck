import { resolve } from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { resolveSource, toPost, selectDuePosts } from '@postdeck/core'
import type { BlogConfig } from '@postdeck/core'
import { resolveConfigPath, loadBlogsConfig, createLocalFs, deployProject, gitToplevel } from '@postdeck/adapters'

export interface RunScheduledArgs {
  project?: string
  all: boolean
  deploy: boolean
  dryRun: boolean
  config?: string
}

export function parseRunScheduledArgs(argv: string[]): RunScheduledArgs {
  const out: RunScheduledArgs = { project: undefined, all: false, deploy: false, dryRun: false, config: undefined }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--project') out.project = argv[++i]
    else if (a === '--all') out.all = true
    else if (a === '--deploy') out.deploy = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--config') out.config = argv[++i]
  }
  return out
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function deployFor(cfg: BlogConfig, slugs: string[]): Promise<void> {
  const isFile = cfg.source.type === 'markdown' || cfg.source.type === 'astro-collection'
  const repoDir = cfg.repoDir ?? (isFile ? gitToplevel((cfg.source as { dir: string }).dir) : undefined)
  if (!repoDir) {
    console.error(`  run-scheduled: --deploy needs a git repo. Set "repoDir" for project "${cfg.id}". Skipping deploy.`)
    return
  }
  await deployProject(repoDir, { emptyCommit: !isFile, message: `publish (scheduled): ${slugs.join(', ')}` })
  console.log(`  deployed: git push (${repoDir})`)
}

export async function runScheduled(argv: string[]): Promise<void> {
  const args = parseRunScheduledArgs(argv)
  const cwd = process.cwd()
  loadDotenv({ path: resolve(cwd, '.env') })

  if (!args.project && !args.all) {
    console.error('postdeck run-scheduled: pass --project <id> or --all')
    process.exit(1)
  }

  const config = await loadBlogsConfig(resolveConfigPath(cwd, args.config))
  const targets = args.all ? config : config.filter((b) => b.id === args.project)
  if (!args.all && targets.length === 0) {
    console.error(`postdeck run-scheduled: no project "${args.project}" in config. Available: ${config.map((b) => b.id).join(', ')}`)
    process.exit(1)
  }

  const deps = { fileStore: createLocalFs('/'), env: (n: string) => process.env[n], fetchImpl: fetch }
  const now = new Date()
  let totalPublished = 0

  for (const cfg of targets) {
    try {
      const source = resolveSource(cfg, deps)
      const posts = (await source.list()).map((r) => toPost(r, cfg, now))
      const due = selectDuePosts(posts, now)
      if (due.length === 0) {
        console.log(`${cfg.id}: nothing due`)
        continue
      }
      if (args.dryRun) {
        console.log(`${cfg.id}: ${due.length} due (dry-run): ${due.map((d) => d.slug).join(', ')}`)
        continue
      }
      const published: string[] = []
      for (const post of due) {
        try {
          await source.publish(post.id)
          published.push(post.slug)
          totalPublished++
          console.log(`published: ${cfg.id}/${post.slug}`)
        } catch (e) {
          console.error(`failed: ${cfg.id}/${post.slug} — ${errMsg(e)}`)
        }
      }
      if (args.deploy && published.length > 0) await deployFor(cfg, published)
    } catch (e) {
      // one project's failure (e.g. missing token in cron) must not abort the rest
      console.error(`${cfg.id}: skipped — ${errMsg(e)}`)
    }
  }

  if (!args.dryRun) console.log(`done: ${totalPublished} published`)
}
