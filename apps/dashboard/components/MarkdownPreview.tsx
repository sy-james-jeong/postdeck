import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

// Renders generated markdown as HTML.
// - remark-gfm: tables, strikethrough, task lists, autolinks.
// - rehype-highlight: syntax highlighting on fenced code (adds hljs class names only).
// react-markdown still does NOT render raw HTML (no rehype-raw), and neither plugin
// enables it, so embedded <script>/<img onerror> in the body stay escaped text — safe
// to render LLM output without extra sanitization.
export function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div className="preview">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
