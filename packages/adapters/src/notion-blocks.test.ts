import { expect, test } from 'vitest'
import { blocksToMarkdown } from './index.js'

const rt = (s: string) => ({ rich_text: [{ plain_text: s }] })

test('blocksToMarkdown renders common block types', () => {
  const blocks = [
    { type: 'heading_1', heading_1: rt('Title') },
    { type: 'paragraph', paragraph: rt('A paragraph.') },
    { type: 'heading_2', heading_2: rt('Sub') },
    { type: 'bulleted_list_item', bulleted_list_item: rt('one') },
    { type: 'numbered_list_item', numbered_list_item: rt('first') },
    { type: 'to_do', to_do: { rich_text: [{ plain_text: 'done' }], checked: true } },
    { type: 'quote', quote: rt('wise') },
    { type: 'code', code: { rich_text: [{ plain_text: 'const x = 1' }], language: 'js' } },
    { type: 'divider', divider: {} },
  ]
  const md = blocksToMarkdown(blocks)
  expect(md).toContain('# Title')
  expect(md).toContain('A paragraph.')
  expect(md).toContain('## Sub')
  expect(md).toContain('- one')
  expect(md).toContain('1. first')
  expect(md).toContain('- [x] done')
  expect(md).toContain('> wise')
  expect(md).toContain('```js\nconst x = 1\n```')
  expect(md).toContain('---')
})

test('blocksToMarkdown skips unknown types with no text and returns "" for empty', () => {
  expect(blocksToMarkdown([])).toBe('')
  expect(blocksToMarkdown([{ type: 'unsupported_widget', unsupported_widget: {} }])).toBe('')
})
