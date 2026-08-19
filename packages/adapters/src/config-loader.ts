import { resolve } from 'node:path'
import { createJiti } from 'jiti'
import { blogsConfigSchema, type BlogsConfig } from '@postdeck/core'

export function resolveConfigPath(cwd: string, explicit?: string): string {
  return resolve(cwd, explicit ?? 'blogs.config.ts')
}

export async function loadBlogsConfig(configPath: string): Promise<BlogsConfig> {
  const jiti = createJiti(import.meta.url, { interopDefault: true })
  const mod: any = await jiti.import(configPath)
  const value = mod?.default ?? mod
  return blogsConfigSchema.parse(value)
}
