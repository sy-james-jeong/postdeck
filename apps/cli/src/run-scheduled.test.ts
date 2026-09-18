import { expect, test } from 'vitest'
import { parseRunScheduledArgs } from './run-scheduled.js'

test('parseRunScheduledArgs reads project/all/deploy/dry-run/config', () => {
  expect(parseRunScheduledArgs(['--project', 'reamly', '--deploy', '--dry-run'])).toEqual({
    project: 'reamly', all: false, deploy: true, dryRun: true, config: undefined,
  })
})
test('parseRunScheduledArgs --all with defaults', () => {
  expect(parseRunScheduledArgs(['--all'])).toEqual({ project: undefined, all: true, deploy: false, dryRun: false, config: undefined })
})
