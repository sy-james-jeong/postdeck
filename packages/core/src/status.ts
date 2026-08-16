import type { PostStatus } from './post.js'
import type { StatusRule } from './config.js'

export function normalizeStatus(input: {
  statusValue?: unknown
  draftValue?: unknown
  publishDate: Date | null
  rule?: StatusRule
  now: Date
}): PostStatus {
  const { statusValue, draftValue, publishDate, rule, now } = input
  if (rule?.allPublished) return 'published'
  // draft detection: boolean flag, or status string matching the rule's draftValue
  const isDraft =
    draftValue === true ||
    (rule?.draftValue != null && String(statusValue ?? '').toLowerCase() === rule.draftValue.toLowerCase()) ||
    String(statusValue ?? '').toLowerCase() === 'draft'
  if (isDraft) return 'draft'
  if (publishDate && publishDate.getTime() > now.getTime()) return 'scheduled'
  return 'published'
}
