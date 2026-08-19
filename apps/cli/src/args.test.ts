import { expect, test } from 'vitest'
import { parseArgs } from './args.js'

test('defaults: port 3000, open true, no explicit config', () => {
  expect(parseArgs([])).toEqual({ config: undefined, port: 3000, open: true })
})
test('--port sets the port', () => {
  expect(parseArgs(['--port', '4123']).port).toBe(4123)
})
test('--no-open disables opening the browser', () => {
  expect(parseArgs(['--no-open']).open).toBe(false)
})
test('--config path is captured', () => {
  expect(parseArgs(['--config', 'custom.ts']).config).toBe('custom.ts')
})
