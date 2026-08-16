import type { Post } from './post.js'
import type { RawPost } from './post.js'
import type { BlogConfig } from './config.js'
import { normalizeStatus } from './status.js'

const asDate = (v: unknown): Date | null => {
  if (v == null || v === '') return null
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}
const asTags = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []

export function toPost(raw: RawPost, cfg: BlogConfig, now: Date): Post {
  const f = raw.fields
  const publishDate = asDate(f.date)
  const status = normalizeStatus({
    statusValue: f.status,
    draftValue: f.draft,
    publishDate,
    rule: cfg.statusRule,
    now,
  })
  const liveUrl =
    cfg.liveUrl && status === 'published'
      ? `${cfg.liveUrl.replace(/\/$/, '')}/${raw.slug}`
      : undefined
  return {
    id: raw.id,
    project: cfg.id,
    title: String(f.title ?? 'Untitled'),
    slug: raw.slug,
    status,
    publishDate,
    updatedDate: asDate(f.updated) ?? undefined,
    excerpt: String(f.excerpt ?? ''),
    tags: asTags(f.tags),
    author: f.author != null ? String(f.author) : undefined,
    liveUrl,
    raw: raw.raw,
  }
}
