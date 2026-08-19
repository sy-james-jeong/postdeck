import { expect, test } from 'vitest'
import { blogsConfigSchema } from '@postdeck/core'
import example from './blogs.config.example.js'

test('blogs.config.example.ts is a valid config', () => {
  const parsed = blogsConfigSchema.parse(example)
  expect(parsed.map((b) => b.id)).toEqual(['reamly', 'freelance', 'hongix'])
})
