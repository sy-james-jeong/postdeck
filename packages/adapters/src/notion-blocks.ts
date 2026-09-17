// Pure Notion-block → markdown converter (top-level blocks only; no nested children,
// no inline annotations — sufficient for tone snippets and a basic body view).
const rt = (data: any): string => (data?.rich_text ?? []).map((t: any) => t?.plain_text ?? '').join('')

export function blocksToMarkdown(blocks: unknown[]): string {
  const lines: string[] = []
  for (const block of (blocks ?? []) as any[]) {
    const t: string | undefined = block?.type
    if (!t) continue
    const data = block[t]
    switch (t) {
      case 'paragraph': { const s = rt(data); if (s) lines.push(s); break }
      case 'heading_1': lines.push(`# ${rt(data)}`); break
      case 'heading_2': lines.push(`## ${rt(data)}`); break
      case 'heading_3': lines.push(`### ${rt(data)}`); break
      case 'bulleted_list_item': lines.push(`- ${rt(data)}`); break
      case 'numbered_list_item': lines.push(`1. ${rt(data)}`); break
      case 'to_do': lines.push(`- [${data?.checked ? 'x' : ' '}] ${rt(data)}`); break
      case 'quote': lines.push(`> ${rt(data)}`); break
      case 'code': lines.push('```' + (data?.language ?? '') + '\n' + rt(data) + '\n```'); break
      case 'divider': lines.push('---'); break
      default: { const s = rt(data); if (s) lines.push(s) }
    }
  }
  return lines.join('\n\n').trim()
}
