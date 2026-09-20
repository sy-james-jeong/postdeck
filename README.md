# PostDeck

Manage several portfolio blogs from **one dashboard** — see what's draft, scheduled, or
live across all of them; draft new posts with AI plus an anti-"AI-sounding" pass; and
publish, unpublish, or schedule — all **git-based and self-hosted**.

PostDeck is a local tool, not a service. You clone it, point it at your existing blog
repos and/or a Notion database with a small config file, and run it yourself. Your
content, your API keys, and your git history stay on your machine.

---

## Why

Portfolio blogs tend to live in different places — one is an Astro content collection,
another is a folder of markdown, another is a Notion database. PostDeck puts them behind
one interface so you can see and manage all of them without switching tools.

## Features

- **Unified dashboard** — every post across every blog, with status (draft / scheduled /
  published), publish dates, translation coverage, and a month-by-month timeline.
- **AI drafting with a De-AI pass** — generate an on-tone draft from a topic, then a
  linter flags typical "written by AI" tells (overused phrases, emoji, em-dashes, uniform
  sentence rhythm), an LLM rewrite reduces them, and you get a before→after summary.
  Drafts are saved as drafts — nothing is published automatically.
- **Rendered preview** — see the draft as formatted markdown (GFM tables, task lists,
  syntax-highlighted code) with a Preview/Markdown toggle.
- **Publish & unpublish** — flip draft↔published from the dashboard (per-row buttons or
  multi-select bulk publish) or the CLI. Local and reversible by default; pushing live is
  behind an explicit flag.
- **Scheduled publishing** — give a draft a future date; a cron/CI job publishes it when
  the date arrives.
- **Pluggable AI provider** — Google Gemini (default), Anthropic, or OpenAI.

## How it works

A pnpm monorepo:

| Package | Role |
| --- | --- |
| `@postdeck/core` | Pure domain logic — config schema, normalization, the De-AI linter, the writing pipeline. No I/O. |
| `@postdeck/adapters` | I/O — source adapters (markdown / Astro / Notion), a file+git store, and the LLM clients. |
| `apps/dashboard` | The Next.js dashboard. |
| `apps/cli` | The `postdeck` command-line tool. |

Each blog is a **source** behind one common interface (`list` / `read` / `createDraft` /
`publish` / `unpublish`). Your config maps each blog's own field names to canonical ones,
so different formats look the same to the rest of the app.

---

## Requirements

- Node ≥ 20 and [pnpm](https://pnpm.io).
- Blog content in one of: a markdown directory, an Astro content-collection directory, or
  a Notion database.
- For AI drafting: an API key for one provider (Gemini / Anthropic / OpenAI).

## Setup

```bash
git clone <your-fork-url>
cd postdeck
pnpm install
```

**1. Describe your blogs.** Copy the example and edit it with your real paths / Notion DB:

```bash
cp blogs.config.example.ts blogs.config.ts
```

`blogs.config.ts` is gitignored — it holds your machine-specific paths and IDs.

**2. Add secrets.** Copy the env example and fill in the key for your chosen provider (and
Notion token/DB if you use Notion):

```bash
cp .env.example .env
```

`.env` is gitignored — keys never get committed.

## Configuring your blogs

`blogs.config.ts` exports a list of blogs. Three source types are supported:

```ts
import { defineBlogs, astroCollectionSource, markdownSource, notionSource } from '@postdeck/core'

export default defineBlogs([
  // Astro content collection (multi-language)
  {
    id: 'site-a',
    name: 'Site A',
    liveUrl: 'https://site-a.example/blog',
    source: astroCollectionSource({
      dir: '/absolute/path/to/site-a/src/content/blog',
      langs: ['en', 'ko'],
    }),
    fieldMap: { title: 'title', date: 'date', excerpt: 'description' },
    groupTranslationsBy: 'slug',
  },

  // Plain markdown directory
  {
    id: 'guides',
    name: 'Guides',
    source: markdownSource({ dir: '/absolute/path/to/guides' }),
    fieldMap: { title: 'title', date: 'datePublished', excerpt: 'description', slug: 'slug', status: 'status' },
    statusRule: { draftValue: 'draft' },   // or { allPublished: true } if there's no status field
  },

  // Notion database
  {
    id: 'notes',
    name: 'Notes',
    liveUrl: 'https://notes.example/blog',
    source: notionSource({ databaseId: process.env.NOTION_DB ?? '', tokenRef: 'NOTION_TOKEN' }),
    fieldMap: { title: 'Title', date: 'Date', status: 'Status', excerpt: 'Excerpt', tags: 'Tags', slug: 'Slug' },
  },
])
```

Key fields:

- **`fieldMap`** — maps your source's field names to canonical ones (`title`, `date`,
  `excerpt`, `status`, `slug`, `draft`, `tags`, `author`, `updated`).
- **`statusRule`** — how "draft" is detected: `{ draftValue: 'draft' }` (a status field
  equal to that value), or `{ allPublished: true }` for sources with no status field.
- **`groupTranslationsBy: 'slug'`** — group multi-language posts into one row (Astro).
- **`publishStatus`** *(optional)* — the value to write when publishing (default
  `published` for files, `Published` for Notion).
- **`repoDir`** *(optional)* — git repo to push for `--deploy` (auto-detected for
  file-based sources; required for Notion).

---

## Usage

Run the CLI with:

```bash
node apps/cli/bin/postdeck.mjs <command> [flags]
```

Optionally alias it: `alias postdeck="node $(pwd)/apps/cli/bin/postdeck.mjs"`. The examples
below assume that alias.

### Dashboard

```bash
postdeck                 # boots the dashboard at http://localhost:3000
postdeck --port 3400     # custom port
postdeck --no-open       # don't auto-open the browser
postdeck --config ./blogs.config.ts
```

From the dashboard you can read every blog's status, write drafts, publish drafts (single
or bulk), unpublish published posts, and preview generated markdown.

### Write a draft (AI)

```bash
postdeck write --project <id> --topic "3 tips for tracking freelance income" [--lang en] [--dry-run]
```

Generates an on-tone draft, runs the De-AI pass, and saves it as a **draft**. `--dry-run`
prints the result without saving.

### Publish / unpublish

```bash
postdeck publish   --project <id> --slug <slug> [--deploy]
postdeck unpublish --project <id> --slug <slug> [--deploy]
```

By default this only flips the status locally (a reversible git commit). Add **`--deploy`**
to `git push` and take the change live.

### Scheduled publishing

Give a draft a **future publish date**, then run this on a schedule:

```bash
postdeck run-scheduled --all [--deploy] [--dry-run]
# or a single project:
postdeck run-scheduled --project <id>
```

It publishes any draft whose date has arrived. Undated drafts are never auto-published, so
works-in-progress are safe. PostDeck runs no background daemon — trigger it from cron or
CI. Example GitHub Actions workflow:

```yaml
on:
  schedule: [{ cron: '0 * * * *' }]   # hourly
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: node apps/cli/bin/postdeck.mjs run-scheduled --all --deploy
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
          NOTION_DB: ${{ secrets.NOTION_DB }}
```

## AI provider

Choose your provider in `.env`:

```bash
POSTDECK_LLM=gemini          # gemini (default) | anthropic | openai
GEMINI_API_KEY=...
# ANTHROPIC_API_KEY=...
# OPENAI_API_KEY=...

# optional model overrides (providers rotate model ids):
# POSTDECK_GEMINI_MODEL=gemini-3.6-flash
# POSTDECK_OPENAI_MODEL=gpt-4o-mini
```

The provider is chosen per instance (one setting per install). All three plug into the
same internal interface, so switching is just an env change.

## Security

- `blogs.config.ts`, `.env`, and `.env.local` are gitignored — your paths, database IDs,
  and API keys are never committed.
- Publishing commits and (with `--deploy`) pushes to **your** blog repos. The dashboard
  never pushes: going live is CLI-only, behind `--deploy`.

## Development

```bash
pnpm test        # unit tests
pnpm typecheck   # core + adapters type check
```

## License

Personal project — add a license here if you intend to share it.
