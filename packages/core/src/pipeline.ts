import type { LLMClient } from './llm.js'
import { buildGeneratePrompt, buildRewritePrompt } from './prompts.js'
import { deAiLint, type LintFinding } from './deai.js'
import type { BlogSource } from './source.js'
import type { Ref } from './post.js'
import { slugify } from './slug.js'

export interface ToneContext {
  projectName: string
  samples: { title: string; snippet: string }[]
}

export interface GenerateInput {
  project: string
  topic: string
  toneContext: ToneContext
  lang?: string
}

export interface Draft {
  title: string
  excerpt: string
  tags: string[]
  body: string
}

function parseDraftJson(text: string): Draft {
  let raw = text.trim()
  // Unwrap a ```json … ``` fence ONLY when it wraps the whole response. Anchoring
  // to start/end (rather than a non-greedy inner match) means a code fence inside
  // the JSON body does not truncate the captured JSON.
  const fence = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fence) raw = fence[1].trim()
  // Fallback for leading/trailing prose: slice the outermost {...} object.
  if (!raw.startsWith('{')) {
    const first = raw.indexOf('{')
    const last = raw.lastIndexOf('}')
    if (first !== -1 && last > first) raw = raw.slice(first, last + 1)
  }
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    throw new Error(`generateDraft: LLM did not return valid JSON:\n${text.slice(0, 200)}`)
  }
  const o = obj as Record<string, unknown>
  if (!o || typeof o.title !== 'string' || typeof o.body !== 'string') {
    throw new Error('generateDraft: JSON missing required string fields title/body')
  }
  return {
    title: o.title,
    excerpt: typeof o.excerpt === 'string' ? o.excerpt : '',
    tags: Array.isArray(o.tags) ? o.tags.map(String) : [],
    body: o.body,
  }
}

export async function generateDraft(input: GenerateInput, llm: LLMClient): Promise<Draft> {
  const { system, prompt } = buildGeneratePrompt(input)
  const text = await llm.complete({ system, prompt })
  return parseDraftJson(text)
}

export interface ReviewReport {
  before: LintFinding[]
  after: LintFinding[]
  rewriteNote: string
}

export async function deAiReview(body: string, llm: LLMClient): Promise<{ body: string; report: ReviewReport }> {
  const before = deAiLint(body)
  const { system, prompt } = buildRewritePrompt(body, before)
  const rewritten = (await llm.complete({ system, prompt })).trim()
  const after = deAiLint(rewritten)
  return {
    body: rewritten,
    report: { before, after, rewriteNote: `rewrote ${body.length}→${rewritten.length} chars` },
  }
}

export interface WriteResult {
  draft: Draft
  report: ReviewReport
}

export async function writeDraft(
  input: GenerateInput,
  deps: { llm: LLMClient; source: BlogSource },
): Promise<{ ref: Ref; result: WriteResult }> {
  const generated = await generateDraft(input, deps.llm)
  const reviewed = await deAiReview(generated.body, deps.llm)
  const draft: Draft = { ...generated, body: reviewed.body }
  const ref = await deps.source.createDraft({
    slug: slugify(draft.title),
    title: draft.title,
    excerpt: draft.excerpt,
    tags: draft.tags,
    body: draft.body,
    lang: input.lang,
  })
  return { ref, result: { draft, report: reviewed.report } }
}
