import { expect, test } from 'vitest'
import { buildGeneratePrompt, buildRewritePrompt } from './index.js'

const input = {
  project: 'hongix',
  topic: 'How to price freelance work',
  toneContext: {
    projectName: 'Hongix',
    samples: [{ title: 'Sample One', snippet: 'A short human paragraph.' }],
  },
  lang: 'en',
}

test('buildGeneratePrompt includes project name, topic, sample, and JSON instruction', () => {
  const { system, prompt } = buildGeneratePrompt(input)
  expect(system).toContain('Hongix')
  expect(prompt).toContain('How to price freelance work')
  expect(prompt).toContain('Sample One')
  expect(prompt).toContain('JSON')
})

test('buildRewritePrompt lists findings and includes the body', () => {
  const { prompt } = buildRewritePrompt('the body text', [
    { id: 'emoji', label: 'Emoji', matches: ['🎉'], count: 1 },
  ])
  expect(prompt).toContain('Emoji')
  expect(prompt).toContain('the body text')
})
