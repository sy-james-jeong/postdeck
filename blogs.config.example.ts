import { defineBlogs, astroCollectionSource, markdownSource, notionSource } from '@postdeck/core'

// Copy this file to blogs.config.ts (gitignored) and fill in your real absolute
// paths + Notion database id. Secrets go in .env and are referenced by name.
export default defineBlogs([
  {
    id: 'reamly',
    name: 'Reamly',
    liveUrl: 'https://reamly.example/blog',
    source: astroCollectionSource({
      dir: '/absolute/path/to/reamly/apps/web/src/content/blog',
      langs: ['en', 'ko', 'ja', 'id'],
    }),
    fieldMap: { title: 'title', date: 'date', excerpt: 'description' },
    groupTranslationsBy: 'slug',
  },
  {
    id: 'freelance',
    name: 'Freelance Invoicer',
    liveUrl: 'https://freelance.example/guides',
    source: markdownSource({ dir: '/absolute/path/to/12_freelance-invoicer/content/guides' }),
    fieldMap: { title: 'title', date: 'datePublished', excerpt: 'description', slug: 'slug', updated: 'dateModified' },
    statusRule: { allPublished: true },
  },
  {
    id: 'hongix',
    name: 'Hongix',
    liveUrl: 'https://hongix.example/blog',
    // databaseId is read from .env so your private DB id never lands in git.
    source: notionSource({ databaseId: process.env.NOTION_DB ?? '', tokenRef: 'NOTION_TOKEN' }),
    fieldMap: { title: 'Title', date: 'Date', status: 'Status', excerpt: 'Excerpt', tags: 'Tags', slug: 'Slug' },
  },
])
