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

test('does not emit raw HTML from the body (XSS-safe: no rehype-raw)', () => {
  const html = renderToStaticMarkup(<MarkdownPreview markdown={'hi <script>alert(1)</script> <img src=x onerror=alert(2)>'} />)
  // The dangerous markup is escaped to text, so no live <script>/<img> element exists.
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('<img')
  expect(html).toContain('&lt;script&gt;')  // shown as escaped text instead
  expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;')
})
