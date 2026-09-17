import { expect, test } from 'vitest'
import { projectOptions, deAiSummary } from './write-format.js'

test('projectOptions maps id + name (name falls back to id)', () => {
  const cfg = [
    { id: 'a', name: 'Alpha', source: { type: 'markdown', dir: 'd' }, fieldMap: { title: 't', date: 'd', excerpt: 'e' } },
    { id: 'b', source: { type: 'markdown', dir: 'd' }, fieldMap: { title: 't', date: 'd', excerpt: 'e' } },
  ] as any
  expect(projectOptions(cfg)).toEqual([{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'b' }])
})

test('deAiSummary shows before→after per rule, or clean', () => {
  expect(deAiSummary({ before: [], after: [], rewriteNote: '' })).toBe('clean (no AI tics flagged)')
  const r = {
    before: [{ id: 'emoji', label: 'Emoji', matches: ['x', 'y', 'z'], count: 3 }],
    after: [],
    rewriteNote: '',
  }
  expect(deAiSummary(r)).toBe('emoji 3→0')
})
