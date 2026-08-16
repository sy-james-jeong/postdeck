import { basename } from 'node:path'
import type { SourceFactory, BlogSource, RawPost, DraftInput, Ref, FieldMap } from '@postdeck/core'
import { parseFrontmatter, patchFrontmatter } from './frontmatter.js'

// Build canonical `fields` from raw frontmatter using the project's fieldMap.
function canonicalFields(raw: Record<string, unknown>, fm: FieldMap): Record<string, unknown> {
  const get = (k?: string) => (k ? raw[k] : undefined)
  return {
    title: get(fm.title), date: get(fm.date), excerpt: get(fm.excerpt),
    status: get(fm.status), draft: get(fm.draft), tags: get(fm.tags),
    author: get(fm.author), updated: get(fm.updated),
  }
}

export const markdownFactory: SourceFactory = (cfg, deps) => {
  const fs = deps.fileStore
  if (!fs) throw new Error('markdown adapter requires a fileStore')
  const dir = (cfg.source as { dir: string }).dir
  const fm = cfg.fieldMap

  const source: BlogSource = {
    capabilities: { canWrite: true, enforcesFutureDates: false, supportsTranslations: false },
    async list(): Promise<RawPost[]> {
      const files = (await fs.list(dir)).filter((f) => f.endsWith('.md'))
      const out: RawPost[] = []
      for (const f of files) {
        const raw = parseFrontmatter(await fs.read(`${dir}/${f}`)).data
        const slug = String(raw[fm.slug ?? 'slug'] ?? basename(f, '.md'))
        out.push({ id: slug, slug, fields: canonicalFields(raw, fm), raw })
      }
      return out
    },
    async read() {
      throw new Error('read() is not implemented until L2')
    },
    async createDraft(input: DraftInput): Promise<Ref> {
      // Build a template with a draft marker, then patch mapped keys by their SOURCE names.
      const template = `---\n${fm.status ?? 'status'}: draft\n---\n\n${input.body}\n`
      const patch: Record<string, unknown> = {
        [fm.title]: input.title,
        [fm.date]: input.date ? input.date.toISOString().slice(0, 10) : '',
        [fm.excerpt]: input.excerpt,
        ...(fm.tags && input.tags ? { [fm.tags]: input.tags } : {}),
        ...(input.extraFields ?? {}),
      }
      const content = patchFrontmatter(template, patch)
      const path = `${dir}/${input.slug}.md`
      await fs.write(path, content, { message: `blog: draft ${input.slug}` })
      return { id: input.slug, path }
    },
  }
  return source
}
