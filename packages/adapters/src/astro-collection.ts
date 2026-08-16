import { basename } from 'node:path'
import type { SourceFactory, BlogSource, RawPost, DraftInput, Ref, FieldMap } from '@blogmanager/core'
import { parseFrontmatter, patchFrontmatter } from './frontmatter.js'

// Build canonical `fields` from raw frontmatter using the project's fieldMap.
// Self-contained per adapter (see markdown.ts) rather than shared, per plan.
function canonicalFields(raw: Record<string, unknown>, fm: FieldMap): Record<string, unknown> {
  const get = (k?: string) => (k ? raw[k] : undefined)
  return {
    title: get(fm.title), date: get(fm.date), excerpt: get(fm.excerpt),
    status: get(fm.status), draft: get(fm.draft), tags: get(fm.tags),
    author: get(fm.author), updated: get(fm.updated),
  }
}

export const astroCollectionFactory: SourceFactory = (cfg, deps) => {
  const fs = deps.fileStore
  if (!fs) throw new Error('astro-collection adapter requires a fileStore')
  const src = cfg.source as { dir: string; langs: string[] }
  const fm = cfg.fieldMap

  const source: BlogSource = {
    capabilities: { canWrite: true, enforcesFutureDates: false, supportsTranslations: true },
    async list(): Promise<RawPost[]> {
      const out: RawPost[] = []
      for (const lang of src.langs) {
        const langDir = `${src.dir}/${lang}`
        const files = (await fs.list(langDir)).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))
        for (const f of files) {
          const raw = parseFrontmatter(await fs.read(`${langDir}/${f}`)).data
          const slug = basename(f).replace(/\.mdx?$/, '')
          out.push({ id: `${lang}/${slug}`, slug, lang, fields: canonicalFields(raw, fm), raw })
        }
      }
      return out
    },
    async read() {
      throw new Error('read() is not implemented until L2')
    },
    async createDraft(input: DraftInput): Promise<Ref> {
      const lang = input.lang ?? src.langs[0]
      const template = `---\n${fm.draft ?? 'draft'}: true\n---\n\n${input.body}\n`
      const patch: Record<string, unknown> = {
        [fm.title]: input.title,
        [fm.date]: input.date ? input.date.toISOString().slice(0, 10) : '',
        [fm.excerpt]: input.excerpt,
        ...(fm.tags && input.tags ? { [fm.tags]: input.tags } : {}),
        ...(input.extraFields ?? {}),
      }
      const content = patchFrontmatter(template, patch)
      const path = `${src.dir}/${lang}/${input.slug}.md`
      await fs.write(path, content, { message: `blog: draft ${lang}/${input.slug}` })
      return { id: `${lang}/${input.slug}`, path }
    },
  }
  return source
}
