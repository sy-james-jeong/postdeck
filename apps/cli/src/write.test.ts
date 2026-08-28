import { expect, test } from 'vitest'
import { parseWriteArgs, isMissingCredentialError } from './write.js'

test('parseWriteArgs reads project/topic/lang/config and dry-run', () => {
  expect(parseWriteArgs(['--project', 'hongix', '--topic', 'Pricing work', '--lang', 'en', '--dry-run'])).toEqual({
    project: 'hongix', topic: 'Pricing work', lang: 'en', dryRun: true, config: undefined,
  })
})
test('parseWriteArgs defaults dryRun to false and fields to undefined', () => {
  expect(parseWriteArgs([])).toEqual({ project: undefined, topic: undefined, lang: undefined, dryRun: false, config: undefined })
})
test('parseWriteArgs captures --config', () => {
  expect(parseWriteArgs(['--config', 'custom.ts']).config).toBe('custom.ts')
})
test('isMissingCredentialError detects SDK auth errors, ignores others', () => {
  expect(isMissingCredentialError(new Error('Could not resolve authentication method. Expected one of apiKey...'))).toBe(true)
  expect(isMissingCredentialError(new Error('network timeout'))).toBe(false)
})
