import type { BlogSource, BlogConfig, ToneContext } from '@postdeck/core'

export async function gatherToneContext(
  source: BlogSource,
  cfg: BlogConfig,
  opts?: { max?: number },
): Promise<ToneContext> {
  const max = opts?.max ?? 3
  const raws = await source.list()
  const chosen = raws.slice(0, max)
  const samples: { title: string; snippet: string }[] = []
  for (const r of chosen) {
    const title = String(r.fields.title ?? r.slug)
    let snippet: string
    try {
      const { body } = await source.read(r.id)
      snippet = body.trim().slice(0, 500)
    } catch {
      snippet = String(r.fields.excerpt ?? '')
    }
    samples.push({ title, snippet })
  }
  return { projectName: cfg.name ?? cfg.id, samples }
}
