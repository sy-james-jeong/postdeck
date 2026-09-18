import ReactMarkdown from 'react-markdown'

// Renders generated markdown as HTML. react-markdown does NOT render raw HTML by
// default (no rehype-raw), so embedded <script>/<img onerror> in the body are shown
// as escaped text — safe to render LLM output without extra sanitization.
export function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div className="preview">
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  )
}
