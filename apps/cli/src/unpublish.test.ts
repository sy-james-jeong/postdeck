import { expect, test } from 'vitest'
import { parseUnpublishArgs } from './unpublish.js'

test('parseUnpublishArgs reads project/slug/config and --deploy', () => {
  expect(parseUnpublishArgs(['--project', 'hongix', '--slug', 'my-post', '--deploy'])).toEqual({
    project: 'hongix', slug: 'my-post', deploy: true, config: undefined,
  })
})
test('parseUnpublishArgs defaults deploy false', () => {
  expect(parseUnpublishArgs(['--project', 'x', '--slug', 'y'])).toEqual({ project: 'x', slug: 'y', deploy: false, config: undefined })
})
