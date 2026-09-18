import { expect, test } from 'vitest'
import { parsePublishArgs } from './publish.js'

test('parsePublishArgs reads project/slug/config and --deploy', () => {
  expect(parsePublishArgs(['--project', 'hongix', '--slug', 'my-post', '--deploy'])).toEqual({
    project: 'hongix', slug: 'my-post', deploy: true, config: undefined,
  })
})
test('parsePublishArgs defaults deploy false', () => {
  expect(parsePublishArgs(['--project', 'x', '--slug', 'y'])).toEqual({ project: 'x', slug: 'y', deploy: false, config: undefined })
})
