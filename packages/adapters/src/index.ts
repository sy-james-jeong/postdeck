import { registerSource } from '@blogmanager/core'
import { markdownFactory } from './markdown.js'
import { astroCollectionFactory } from './astro-collection.js'
import { notionFactory } from './notion.js'
registerSource('markdown', markdownFactory)
registerSource('astro-collection', astroCollectionFactory)
registerSource('notion', notionFactory)
export * from './frontmatter.js'
export * from './localfs.js'
export { markdownFactory } from './markdown.js'
export { astroCollectionFactory } from './astro-collection.js'
export { notionFactory } from './notion.js'
