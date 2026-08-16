export type PostStatus = 'draft' | 'scheduled' | 'published'

export interface PostVariant {
  lang: string
  status: PostStatus
  publishDate: Date | null
  present: boolean
}

export interface Post {
  id: string
  project: string
  title: string
  slug: string
  status: PostStatus
  publishDate: Date | null
  updatedDate?: Date
  excerpt: string
  tags: string[]
  author?: string
  liveUrl?: string
  variants?: PostVariant[]
  raw: Record<string, unknown>
}

/** One item as an adapter reads it from a source, before core normalization. */
export interface RawPost {
  id: string
  slug: string
  lang?: string
  fields: Record<string, unknown>   // frontmatter/props already keyed by CANONICAL names (title/date/...)
  raw: Record<string, unknown>      // full original frontmatter/props, untouched
  present?: boolean
}

export interface DraftInput {
  slug: string
  title: string
  excerpt: string
  date?: Date
  tags?: string[]
  body: string          // markdown
  lang?: string
  extraFields?: Record<string, unknown>
}

export interface PostBody { post: Post; body: string }
export interface Ref { id: string; path?: string; url?: string; commit?: string }
