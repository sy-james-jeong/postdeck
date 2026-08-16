import type { SourceFactory, BlogSource, RawPost, DraftInput, Ref, FieldMap } from '@blogmanager/core'

type Prop = any
const readText = (p: Prop): string => {
  if (!p) return ''
  if (p.type === 'title') return (p.title ?? []).map((t: any) => t.plain_text).join('')
  if (p.type === 'rich_text') return (p.rich_text ?? []).map((t: any) => t.plain_text).join('')
  return ''
}
const readStatus = (p: Prop): string =>
  !p ? '' : p.type === 'status' ? (p.status?.name ?? '') : p.type === 'select' ? (p.select?.name ?? '') : ''
const readTags = (p: Prop): string[] =>
  !p ? [] : p.type === 'multi_select' ? p.multi_select.map((s: any) => s.name) : []
const readDate = (p: Prop): string => (p?.type === 'date' ? (p.date?.start ?? '') : '')

function canonicalFields(props: Record<string, Prop>, fm: FieldMap): Record<string, unknown> {
  const pick = (k?: string) => (k ? props[k] : undefined)
  return {
    title: readText(pick(fm.title)),
    date: readDate(pick(fm.date)),
    excerpt: readText(pick(fm.excerpt)),
    status: readStatus(pick(fm.status)),
    tags: readTags(pick(fm.tags)),
    author: fm.author ? readText(pick(fm.author)) : undefined,
  }
}

export const notionFactory: SourceFactory = (cfg, deps) => {
  const src = cfg.source as { databaseId: string; tokenRef: string }
  const token = deps.env(src.tokenRef)
  if (!token) throw new Error(`Notion token env var "${src.tokenRef}" is not set`)
  const fm = cfg.fieldMap
  const doFetch = deps.fetchImpl ?? fetch
  const H = { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }

  const source: BlogSource = {
    capabilities: { canWrite: true, enforcesFutureDates: false, supportsTranslations: false },
    async list(): Promise<RawPost[]> {
      const out: RawPost[] = []
      let cursor: string | undefined
      do {
        const res = await doFetch(`https://api.notion.com/v1/databases/${src.databaseId}/query`, {
          method: 'POST', headers: H,
          body: JSON.stringify(cursor ? { start_cursor: cursor } : {}),
        })
        const j: any = await res.json()
        if (j.object === 'error') throw new Error(`Notion ${j.status} ${j.code}: ${j.message}`)
        for (const page of j.results) {
          const props = page.properties
          const slug = readText(props[fm.slug ?? 'Slug']) || page.id
          out.push({ id: page.id, slug, fields: canonicalFields(props, fm), raw: props })
        }
        cursor = j.has_more ? j.next_cursor : undefined
      } while (cursor)
      return out
    },
    async read() {
      throw new Error('read() is not implemented until L2')
    },
    async createDraft(input: DraftInput): Promise<Ref> {
      const props: any = {
        [fm.title]: { title: [{ text: { content: input.title } }] },
        ...(fm.excerpt ? { [fm.excerpt]: { rich_text: [{ text: { content: input.excerpt } }] } } : {}),
        ...(fm.status ? { [fm.status]: { status: { name: 'Draft' } } } : {}),
      }
      const res = await doFetch('https://api.notion.com/v1/pages', {
        method: 'POST', headers: H,
        body: JSON.stringify({ parent: { database_id: src.databaseId }, properties: props }),
      })
      const j: any = await res.json()
      if (j.object === 'error') throw new Error(`Notion ${j.status} ${j.code}: ${j.message}`)
      return { id: j.id, url: j.url }
    },
  }
  return source
}
