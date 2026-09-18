import type { BlogConfig } from './config.js'
import type { RawPost, DraftInput, Ref, PostBody } from './post.js'
import type { FileStore } from './filestore.js'
import type { LLMClient } from './llm.js'

export interface SourceCapabilities {
  canWrite: boolean
  enforcesFutureDates: boolean
  supportsTranslations: boolean
}

export interface BlogSource {
  capabilities: SourceCapabilities
  list(): Promise<RawPost[]>
  read(id: string): Promise<PostBody>
  createDraft(input: DraftInput): Promise<Ref>
  publish(id: string): Promise<Ref>
}

export interface SourceDeps {
  fileStore?: FileStore
  env: (name: string) => string | undefined
  fetchImpl?: typeof fetch
  llm?: LLMClient
}

export type SourceFactory = (cfg: BlogConfig, deps: SourceDeps) => BlogSource
