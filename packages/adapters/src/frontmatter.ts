import { parseDocument } from 'yaml'

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function splitFrontmatter(raw: string): { yamlText: string; body: string } {
  const m = raw.match(FM)
  if (!m) return { yamlText: '', body: raw }
  return { yamlText: m[1], body: m[2] }
}

export function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const { yamlText, body } = splitFrontmatter(raw)
  if (!yamlText) return { data: {}, body }
  const data = parseDocument(yamlText).toJSON() ?? {}
  return { data, body }
}

/**
 * Set ONLY the given keys, preserving all other keys, their order, comments,
 * and the body. A no-op ({}) returns `raw` unchanged (byte-for-byte).
 */
export function patchFrontmatter(raw: string, patch: Record<string, unknown>): string {
  const m = raw.match(FM)
  if (!m) throw new Error('patchFrontmatter: file has no frontmatter block')
  if (Object.keys(patch).length === 0) return raw
  const doc = parseDocument(m[1])
  for (const [k, v] of Object.entries(patch)) doc.set(k, v)
  // Re-stitch: yaml.stringify keeps a trailing newline; match original delimiters.
  const yamlText = doc.toString().replace(/\n$/, '')
  // The `yaml` stringifier always emits LF. If the source frontmatter block was
  // CRLF-authored, normalize the rebuilt frontmatter block (only) to CRLF so the
  // output doesn't mix line-ending styles. The body (m[2]) is carried through
  // verbatim from `raw` and already has whatever ending style it started with.
  const frontmatterSource = raw.slice(0, raw.length - m[2].length)
  const usesCRLF = /\r\n/.test(frontmatterSource)
  let frontmatterBlock = `---\n${yamlText}\n---\n`
  if (usesCRLF) frontmatterBlock = frontmatterBlock.replace(/\r?\n/g, '\r\n')
  return frontmatterBlock + m[2]
}
