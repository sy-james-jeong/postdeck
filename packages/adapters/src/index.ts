import { registerSource } from '@blogmanager/core'
import { markdownFactory } from './markdown.js'
registerSource('markdown', markdownFactory)
export * from './frontmatter.js'
export * from './localfs.js'
export { markdownFactory } from './markdown.js'
