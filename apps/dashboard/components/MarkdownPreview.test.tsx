import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { MarkdownPreview } from './MarkdownPreview.js'

test('renders markdown headings, bold, and lists to HTML', () => {
  const html = renderToStaticMarkup(<MarkdownPreview markdown={'# Title\n\n**bold** and _em_\n\n- one\n- two'} />)
  expect(html).toContain('<h1>Title</h1>')
  expect(html).toContain('<strong>bold</strong>')
  expect(html).toContain('<em>em</em>')
  expect(html).toContain('<li>one</li>')
})

test('renders GFM: tables, strikethrough, task lists', () => {
  const md = [
    '| a | b |',
    '| - | - |',
    '| 1 | 2 |',
    '',
    '~~gone~~',
    '',
    '- [x] done',
    '- [ ] todo',
  ].join('\n')
  const html = renderToStaticMarkup(<MarkdownPreview markdown={md} />)
  expect(html).toContain('<table>')
  expect(html).toContain('<th>a</th>')
  expect(html).toContain('<td>1</td>')
  expect(html).toContain('<del>gone</del>')
  expect(html).toContain('type="checkbox"')
  expect(html).toContain('checked=""')  // the [x] item
})

test('highlights fenced code blocks (rehype-highlight adds hljs classes)', () => {
  const html = renderToStaticMarkup(<MarkdownPreview markdown={'```js\nconst x = 1\n```'} />)
  expect(html).toContain('class="hljs language-js"')
  expect(html).toMatch(/hljs-keyword|hljs-number|hljs-string|hljs-title/)  // some token got tagged
})

test('does not emit raw HTML from the body (XSS-safe: no rehype-raw)', () => {
  const html = renderToStaticMarkup(<MarkdownPreview markdown={'hi <script>alert(1)</script> <img src=x onerror=alert(2)>'} />)
  // The dangerous markup is escaped to text, so no live <script>/<img> element exists.
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('<img')
  expect(html).toContain('&lt;script&gt;')  // shown as escaped text instead
  expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;')
})
