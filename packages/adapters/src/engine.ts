import {
  resolveSource, toPost, groupTranslations,
  type BlogsConfig, type BlogConfig, type SourceDeps, type Post,
  type RawPost, type SourceCapabilities,
} from '@postdeck/core'

type Counts = { draft: number; scheduled: number; published: number }

export interface ProjectView {
  id: string
  name: string
  liveUrl?: string
  sourceType: 'notion' | 'markdown' | 'astro-collection'
  capabilities: SourceCapabilities
  posts: Post[]
  counts: Counts
  error?: string
}

// Shared: turn an adapter's raw list into normalized (and grouped) posts.
function normalizeRaws(raws: RawPost[], cfg: BlogConfig, now: Date): Post[] {
  let posts = raws.map((r) => {
    const post = toPost(r, cfg, now)
    // seed a single-lang variant so grouping can read the lang
    if (r.lang) post.variants = [{ lang: r.lang, status: post.status, publishDate: post.publishDate, present: true }]
    return post
  })
  if (cfg.groupTranslationsBy && cfg.source.type === 'astro-collection') {
    posts = groupTranslations(posts, cfg.source.langs)
  }
  return posts
}

function countByStatus(posts: Post[]): Counts {
  const c: Counts = { draft: 0, scheduled: 0, published: 0 }
  for (const p of posts) c[p.status]++
  return c
}

export async function loadPosts(
  config: BlogsConfig,
  deps: SourceDeps,
  now: Date = new Date(),
): Promise<Record<string, Post[]>> {
  const result: Record<string, Post[]> = {}
  for (const cfg of config) {
    const source = resolveSource(cfg, deps)
    result[cfg.id] = normalizeRaws(await source.list(), cfg, now)
  }
  return result
}

export async function loadProjects(
  config: BlogsConfig,
  deps: SourceDeps,
  now: Date = new Date(),
): Promise<ProjectView[]> {
  const views: ProjectView[] = []
  for (const cfg of config) {
    const base = {
      id: cfg.id,
      name: cfg.name ?? cfg.id,
      liveUrl: cfg.liveUrl,
      sourceType: cfg.source.type,
    }
    try {
      const source = resolveSource(cfg, deps)
      const posts = normalizeRaws(await source.list(), cfg, now)
      views.push({ ...base, capabilities: source.capabilities, posts, counts: countByStatus(posts) })
    } catch (e) {
      views.push({
        ...base,
        capabilities: { canWrite: false, enforcesFutureDates: false, supportsTranslations: false },
        posts: [],
        counts: { draft: 0, scheduled: 0, published: 0 },
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return views
}
