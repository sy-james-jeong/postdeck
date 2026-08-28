import type { GenerateInput } from './pipeline.js'
import type { LintFinding } from './deai.js'

export function buildGeneratePrompt(input: GenerateInput): { system: string; prompt: string } {
  const samples = input.toneContext.samples
    .map((s, i) => `Example ${i + 1} — "${s.title}":\n${s.snippet}`)
    .join('\n\n')
  const system =
    `You are a blog writer for "${input.toneContext.projectName}". ` +
    `Match the voice, tone, and structure of the examples. Write like a human, not an AI. ` +
    `Avoid overused connectors (however, moreover), clichés ("in conclusion", "it's worth noting"), ` +
    `em-dash overuse, uniform sentence length, listicle padding, and emoji.`
  const prompt =
    `Voice examples from this blog:\n\n${samples}\n\n` +
    `Write a new blog post on this topic: "${input.topic}"` +
    `${input.lang ? ` (language: ${input.lang})` : ''}.\n\n` +
    `Return ONLY a JSON object with keys: title (string), excerpt (string, one sentence), ` +
    `tags (string[]), body (string, markdown). No prose outside the JSON.`
  return { system, prompt }
}

export function buildRewritePrompt(body: string, findings: LintFinding[]): { system: string; prompt: string } {
  const issues = findings.length
    ? findings.map((f) => `- ${f.label}: ${f.matches.slice(0, 5).join(', ')}`).join('\n')
    : '- (none flagged, but still tighten any AI-sounding phrasing)'
  const system =
    `You rewrite blog drafts to sound human. Preserve meaning, facts, and structure. ` +
    `Fix the flagged AI tics. Do not add emoji or clichés.`
  const prompt =
    `Rewrite the following markdown so it reads like a human wrote it. Fix these flagged issues:\n${issues}\n\n` +
    `Return ONLY the rewritten markdown body — no JSON, no commentary.\n\n---\n${body}`
  return { system, prompt }
}
