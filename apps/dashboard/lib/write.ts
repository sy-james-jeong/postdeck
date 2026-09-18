import {
  resolveSource, generateDraft, deAiReview, slugify,
  type Draft, type ReviewReport, type Ref, type GenerateInput, type BlogSource,
} from '@postdeck/core'
import { resolveConfigPath, loadBlogsConfig, createLocalFs, gatherToneContext, selectLLM } from '@postdeck/adapters'
import { projectOptions, type WritableProject } from './write-format.js'

export interface GenerateResult {
  draft: Draft
  report: ReviewReport
}

async function loadConfig() {
  return loadBlogsConfig(resolveConfigPath(process.cwd(), process.env.POSTDECK_CONFIG))
}
const envFn = (n: string) => process.env[n]

export async function listWritableProjects(): Promise<WritableProject[]> {
  return projectOptions(await loadConfig())
}

export async function generateForProject(projectId: string, topic: string, lang?: string): Promise<GenerateResult> {
  const config = await loadConfig()
  const cfg = config.find((b) => b.id === projectId)
  if (!cfg) throw new Error(`no project "${projectId}" in config`)
  const llm = selectLLM({ env: envFn })
  const source = resolveSource(cfg, { fileStore: createLocalFs('/'), env: envFn, fetchImpl: fetch, llm })
  const toneContext = await gatherToneContext(source, cfg)
  const input: GenerateInput = { project: cfg.id, topic, toneContext, lang }
  const draft = await generateDraft(input, llm)
  const reviewed = await deAiReview(draft.body, llm)
  return { draft: { ...draft, body: reviewed.body }, report: reviewed.report }
}

export async function saveDraftForProject(projectId: string, draft: Draft, lang?: string): Promise<Ref> {
  const config = await loadConfig()
  const cfg = config.find((b) => b.id === projectId)
  if (!cfg) throw new Error(`no project "${projectId}" in config`)
  const llm = selectLLM({ env: envFn })
  const source = resolveSource(cfg, { fileStore: createLocalFs('/'), env: envFn, fetchImpl: fetch, llm })
  return source.createDraft({
    slug: slugify(draft.title),
    title: draft.title,
    excerpt: draft.excerpt,
    tags: draft.tags,
    body: draft.body,
    lang,
  })
}

export async function publishPost(projectId: string, postId: string): Promise<Ref> {
  const config = await loadConfig()
  const cfg = config.find((b) => b.id === projectId)
  if (!cfg) throw new Error(`no project "${projectId}" in config`)
  const source = resolveSource(cfg, { fileStore: createLocalFs('/'), env: envFn, fetchImpl: fetch })
  return source.publish(postId)
}

export async function unpublishPost(projectId: string, postId: string): Promise<Ref> {
  const config = await loadConfig()
  const cfg = config.find((b) => b.id === projectId)
  if (!cfg) throw new Error(`no project "${projectId}" in config`)
  const source = resolveSource(cfg, { fileStore: createLocalFs('/'), env: envFn, fetchImpl: fetch })
  return source.unpublish(postId)
}

export interface BulkResult {
  id: string
  ok: boolean
  ref?: Ref
  error?: string
}

/** Publish each id sequentially, isolating failures so one bad id does not abort the rest. */
export async function publishEach(source: BlogSource, postIds: string[]): Promise<BulkResult[]> {
  const results: BulkResult[] = []
  for (const id of postIds) {
    try {
      const ref = await source.publish(id)
      results.push({ id, ok: true, ref })
    } catch (e) {
      results.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return results
}

export async function publishManyPost(projectId: string, postIds: string[]): Promise<BulkResult[]> {
  const config = await loadConfig()
  const cfg = config.find((b) => b.id === projectId)
  if (!cfg) throw new Error(`no project "${projectId}" in config`)
  const source = resolveSource(cfg, { fileStore: createLocalFs('/'), env: envFn, fetchImpl: fetch })
  return publishEach(source, postIds)
}
