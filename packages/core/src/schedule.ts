import type { Post } from './post.js'

/**
 * Posts that are due to be published now: a draft with a publish date that has
 * arrived (`publishDate <= now`). A draft with no date is never due — scheduling
 * is opt-in by setting a publish date on a draft, so an undated work-in-progress
 * is never auto-published. Non-draft posts are already published/scheduled-live.
 */
export function selectDuePosts(posts: Post[], now: Date): Post[] {
  return posts.filter(
    (p) => p.status === 'draft' && p.publishDate != null && p.publishDate.getTime() <= now.getTime(),
  )
}
