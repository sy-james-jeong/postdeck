import type { LLMClient } from './llm.js'
import { buildGeneratePrompt } from './prompts.js'

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
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced ? fenced[1] : text).trim()
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
