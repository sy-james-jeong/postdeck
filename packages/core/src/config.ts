import { z } from 'zod'

export const fieldMapSchema = z.object({
  title: z.string(),
  date: z.string(),
  excerpt: z.string(),
  status: z.string().optional(),
  draft: z.string().optional(),
  tags: z.string().optional(),
  author: z.string().optional(),
  slug: z.string().optional(),
  updated: z.string().optional(),
})
export type FieldMap = z.infer<typeof fieldMapSchema>

export const statusRuleSchema = z.object({
  allPublished: z.boolean().optional(),
  draftValue: z.string().optional(),      // e.g. status === 'draft'
}).optional()
export type StatusRule = z.infer<typeof statusRuleSchema>

export const sourceConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('notion'), databaseId: z.string(), tokenRef: z.string() }),
  z.object({ type: z.literal('markdown'), dir: z.string() }),
  z.object({ type: z.literal('astro-collection'), dir: z.string(), langs: z.array(z.string()) }),
])
export type SourceConfig = z.infer<typeof sourceConfigSchema>

export const blogConfigSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  liveUrl: z.string().optional(),
  source: sourceConfigSchema,
  fieldMap: fieldMapSchema,
  statusRule: statusRuleSchema,
  groupTranslationsBy: z.enum(['slug']).optional(),
  publishStatus: z.string().optional(),
  repoDir: z.string().optional(),
})
export type BlogConfig = z.infer<typeof blogConfigSchema>

export const blogsConfigSchema = z.array(blogConfigSchema)
export type BlogsConfig = z.infer<typeof blogsConfigSchema>

// Typed constructors — return PLAIN DATA (no closures) so config stays serializable.
export const defineBlogs = (list: BlogConfig[]): BlogsConfig => list
export const notionSource = (o: { databaseId: string; tokenRef: string }): SourceConfig =>
  ({ type: 'notion', ...o })
export const markdownSource = (o: { dir: string }): SourceConfig => ({ type: 'markdown', ...o })
export const astroCollectionSource = (o: { dir: string; langs: string[] }): SourceConfig =>
  ({ type: 'astro-collection', ...o })
