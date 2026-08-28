import { expect, test } from 'vitest'
import { deAiLint } from './index.js'

const BAD = `However, this is great. Moreover, it is fine. In this article we explore it. In conclusion, it's worth noting the value 🎉. Furthermore, additionally, thus we conclude.`
const CLEAN = `The invoice went out Tuesday. She paid within the hour. No reminder needed. That surprised me, honestly.`

test('deAiLint flags overused connectors, clichés, listicle padding, and emoji in a bad sample', () => {
  const ids = deAiLint(BAD).map((f) => f.id)
  expect(ids).toContain('overused-connectors')
  expect(ids).toContain('cliche-phrases')
  expect(ids).toContain('listicle-padding')
  expect(ids).toContain('emoji')
})

test('deAiLint counts connector matches', () => {
  const conn = deAiLint(BAD).find((f) => f.id === 'overused-connectors')!
  expect(conn.count).toBeGreaterThanOrEqual(3) // however, moreover, furthermore, additionally, thus
})

test('deAiLint returns [] for clean human prose', () => {
  expect(deAiLint(CLEAN)).toEqual([])
})

test('deAiLint flags uniform sentence length', () => {
  const uniform = 'One two three four five words. Six seven eight nine ten here. Eleven twelve thirteen fourteen fifteen now. Sixteen seventeen eighteen nineteen twenty go.'
  const ids = deAiLint(uniform).map((f) => f.id)
  expect(ids).toContain('uniform-sentence-length')
})
