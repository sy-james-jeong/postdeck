import { expect, test } from 'vitest'
import { buildDeployCommands } from './index.js'

test('buildDeployCommands: push only by default', () => {
  expect(buildDeployCommands({})).toEqual([['push']])
})
test('buildDeployCommands: empty commit then push when emptyCommit', () => {
  expect(buildDeployCommands({ emptyCommit: true, message: 'publish: x' })).toEqual([
    ['commit', '--allow-empty', '-m', 'publish: x'],
    ['push'],
  ])
})
