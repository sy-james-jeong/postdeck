import type { BlogConfig } from './config.js'
import type { BlogSource, SourceDeps, SourceFactory } from './source.js'

const registry = new Map<string, SourceFactory>()

export function registerSource(type: string, factory: SourceFactory): void {
  registry.set(type, factory)
}
export function resolveSource(cfg: BlogConfig, deps: SourceDeps): BlogSource {
  const factory = registry.get(cfg.source.type)
  if (!factory) throw new Error(`No adapter registered for source type "${cfg.source.type}"`)
  return factory(cfg, deps)
}
export function clearRegistry(): void {
  registry.clear()
}
