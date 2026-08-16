import { resolveSource, toPost, groupTranslations, type BlogsConfig, type SourceDeps, type Post } from '@postdeck/core'

export async function loadPosts(
  config: BlogsConfig,
  deps: SourceDeps,
  now: Date = new Date(),
): Promise<Record<string, Post[]>> {
  const result: Record<string, Post[]> = {}
  for (const cfg of config) {
    const source = resolveSource(cfg, deps)
    const raws = await source.list()
    let posts = raws.map((r) => {
      const post = toPost(r, cfg, now)
      // seed a single-lang variant so grouping can read the lang
      if (r.lang) post.variants = [{ lang: r.lang, status: post.status, publishDate: post.publishDate, present: true }]
      return post
    })
    if (cfg.groupTranslationsBy && cfg.source.type === 'astro-collection') {
      posts = groupTranslations(posts, cfg.source.langs)
    }
    result[cfg.id] = posts
  }
  return result
}
