import { resolve } from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { resolveSource, generateDraft, deAiReview, writeDraft, type GenerateInput, type Draft, type ReviewReport } from '@postdeck/core'
import { resolveConfigPath, loadBlogsConfig, createLocalFs, gatherToneContext, selectLLM } from '@postdeck/adapters'

export function isMissingCredentialError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /could not resolve authentication|authentication_error|x-api-key|api[\s_-]?key/i.test(msg)
}

export interface WriteArgs {
  project?: string
  topic?: string
  lang?: string
  dryRun: boolean
  config?: string
}

export function parseWriteArgs(argv: string[]): WriteArgs {
  const out: WriteArgs = { project: undefined, topic: undefined, lang: undefined, dryRun: false, config: undefined }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--project') out.project = argv[++i]
    else if (a === '--topic') out.topic = argv[++i]
    else if (a === '--lang') out.lang = argv[++i]
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--config') out.config = argv[++i]
  }
  return out
}

const fmtCounts = (findings: ReviewReport['before']) =>
  findings.length ? findings.map((f) => `${f.id} ${f.count}`).join(', ') : 'none'

function printDraftAndReport(draft: Draft, report: ReviewReport): void {
  console.log('\n=== DRAFT ===')
  console.log(`title:   ${draft.title}`)
  console.log(`excerpt: ${draft.excerpt}`)
  console.log(`tags:    ${draft.tags.join(', ')}`)
  console.log(`\n${draft.body}\n`)
  console.log('=== DE-AI REPORT ===')
  console.log(`before: ${fmtCounts(report.before)}`)
  console.log(`after:  ${fmtCounts(report.after)}`)
  console.log(report.rewriteNote)
}

export async function runWrite(argv: string[]): Promise<void> {
  const args = parseWriteArgs(argv)
  const cwd = process.cwd()
  loadDotenv({ path: resolve(cwd, '.env') })

  if (!args.project || !args.topic) {
    console.error('postdeck write: --project <id> and --topic "<topic>" are required')
    process.exit(1)
  }

  const config = await loadBlogsConfig(resolveConfigPath(cwd, args.config))
  const cfg = config.find((b) => b.id === args.project)
  if (!cfg) {
    console.error(`postdeck write: no project "${args.project}" in config. Available: ${config.map((b) => b.id).join(', ')}`)
    process.exit(1)
  }

  const llm = selectLLM({ env: (n) => process.env[n] })
  const deps = { fileStore: createLocalFs('/'), env: (n: string) => process.env[n], fetchImpl: fetch, llm }
  const source = resolveSource(cfg, deps)

  const toneContext = await gatherToneContext(source, cfg)
  const input: GenerateInput = { project: cfg.id, topic: args.topic, toneContext, lang: args.lang }

  try {
    if (args.dryRun) {
      const draft = await generateDraft(input, llm)
      const reviewed = await deAiReview(draft.body, llm)
      printDraftAndReport({ ...draft, body: reviewed.body }, reviewed.report)
      console.log('\n(dry-run: not saved)')
      return
    }

    const { ref, result } = await writeDraft(input, { llm, source })
    printDraftAndReport(result.draft, result.report)
    console.log(`\nsaved draft: ${ref.path ?? ref.url ?? ref.id}`)
  } catch (err) {
    if (isMissingCredentialError(err)) {
      console.error(
        'postdeck write: no LLM credentials. Set the key for your provider in .env — ' +
          'GEMINI_API_KEY (default), ANTHROPIC_API_KEY, or OPENAI_API_KEY — ' +
          'and POSTDECK_LLM (gemini | anthropic | openai) to pick one.',
      )
      process.exit(1)
    }
    // Any other provider/API error (quota, model-not-found, network): show the
    // real message on one line instead of a raw stack trace.
    console.error(`postdeck write: generation failed — ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}
