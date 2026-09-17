import type { ReviewReport, BlogsConfig } from '@postdeck/core'

export interface WritableProject {
  id: string
  name: string
}

export function projectOptions(config: BlogsConfig): WritableProject[] {
  return config.map((b) => ({ id: b.id, name: b.name ?? b.id }))
}

export function deAiSummary(report: ReviewReport): string {
  const ids = new Set<string>([...report.before.map((f) => f.id), ...report.after.map((f) => f.id)])
  if (ids.size === 0) return 'clean (no AI tics flagged)'
  const b = new Map(report.before.map((f) => [f.id, f.count]))
  const a = new Map(report.after.map((f) => [f.id, f.count]))
  return [...ids].map((id) => `${id} ${b.get(id) ?? 0}→${a.get(id) ?? 0}`).join(', ')
}
