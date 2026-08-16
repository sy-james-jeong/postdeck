import type { Post, PostVariant } from './post.js'

export function groupTranslations(posts: Post[], langs: string[]): Post[] {
  const bySlug = new Map<string, Post[]>()
  for (const p of posts) {
    const arr = bySlug.get(p.slug) ?? []
    arr.push(p)
    bySlug.set(p.slug, arr)
  }
  const out: Post[] = []
  for (const [, group] of bySlug) {
    const present = new Map<string, Post>()
    for (const p of group) {
      const lang = p.variants?.[0]?.lang ?? 'en'
      present.set(lang, p)
    }
    const variants: PostVariant[] = langs.map((lang) => {
      const p = present.get(lang)
      return p
        ? { lang, status: p.status, publishDate: p.publishDate, present: true }
        : { lang, status: 'draft', publishDate: null, present: false }
    })
    // primary = first present lang in `langs` order
    const primary = langs.map((l) => present.get(l)).find(Boolean) ?? group[0]
    out.push({ ...primary, variants })
  }
  return out
}
