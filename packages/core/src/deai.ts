export interface LintFinding {
  id: string
  label: string
  matches: string[]
  count: number
}

interface Rule {
  id: string
  label: string
  find: (text: string) => string[]
}

const wordRule = (id: string, label: string, words: string[]): Rule => ({
  id,
  label,
  find: (text) => text.match(new RegExp(`\\b(${words.join('|')})\\b`, 'gi')) ?? [],
})

const RULES: Rule[] = [
  wordRule('overused-connectors', 'Overused connectors', [
    'however', 'moreover', 'furthermore', 'additionally', 'thus',
  ]),
  {
    id: 'cliche-phrases',
    label: 'Cliché phrases',
    find: (t) => t.match(/(in conclusion|it'?s worth noting|that said|at the end of the day|when it comes to)/gi) ?? [],
  },
  {
    id: 'em-dash-overuse',
    label: 'Em-dash overuse',
    find: (t) => {
      const dashes = t.match(/—/g) ?? []
      const sentences = t.split(/[.!?]+/).filter((s) => s.trim()).length || 1
      return dashes.length / sentences > 0.5 ? dashes : []
    },
  },
  {
    id: 'uniform-sentence-length',
    label: 'Uniform sentence length',
    find: (t) => {
      const lens = t
        .split(/[.!?]+/)
        .map((s) => s.trim().split(/\s+/).filter(Boolean).length)
        .filter((n) => n > 0)
      if (lens.length < 4) return []
      const mean = lens.reduce((a, b) => a + b, 0) / lens.length
      const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length
      const cv = Math.sqrt(variance) / (mean || 1)
      return cv < 0.15 ? [`cv=${cv.toFixed(2)}`] : []
    },
  },
  {
    id: 'listicle-padding',
    label: 'Listicle padding',
    find: (t) => t.match(/(here are \d+|let'?s dive in|in this article|without further ado)/gi) ?? [],
  },
  {
    id: 'emoji',
    label: 'Emoji',
    find: (t) => t.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? [],
  },
]

export function deAiLint(text: string): LintFinding[] {
  const out: LintFinding[] = []
  for (const r of RULES) {
    const matches = r.find(text)
    if (matches.length > 0) out.push({ id: r.id, label: r.label, matches, count: matches.length })
  }
  return out
}
