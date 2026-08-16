import { registerSource } from '@blogmanager/core'
import { markdownFactory } from './markdown.js'
import { astroCollectionFactory } from './astro-collection.js'
registerSource('markdown', markdownFactory)
registerSource('astro-collection', astroCollectionFactory)
export * from './frontmatter.js'
export * from './localfs.js'
export { markdownFactory } from './markdown.js'
export { astroCollectionFactory } from './astro-collection.js'
