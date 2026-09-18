import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { config as loadDotenv } from 'dotenv'
import { resolveConfigPath, loadBlogsConfig } from '@postdeck/adapters'
import { parseArgs } from './args.js'
import { runWrite } from './write.js'
import { runPublish } from './publish.js'

export async function main(): Promise<void> {
  const argv0 = process.argv.slice(2)
  if (argv0[0] === 'write') {
    await runWrite(argv0.slice(1))
    return
  }
  if (argv0[0] === 'publish') {
    await runPublish(argv0.slice(1))
    return
  }

  const args = parseArgs(process.argv.slice(2))
  const cwd = process.cwd()

  // Load .env from cwd so config's process.env.* refs (e.g. NOTION_DB) resolve,
  // and so the spawned dashboard inherits the same secrets.
  loadDotenv({ path: resolve(cwd, '.env') })

  const configPath = resolveConfigPath(cwd, args.config)
  if (!existsSync(configPath)) {
    console.error(`postdeck: no config found at ${configPath}\nCreate blogs.config.ts (see blogs.config.example.ts).`)
    process.exit(1)
  }
  // Validate early so the user gets a clear error before Next boots.
  await loadBlogsConfig(configPath)

  // Dashboard app dir = this package's node_modules/@postdeck/dashboard resolved to source.
  const here = dirname(fileURLToPath(import.meta.url))
  const dashboardDir = resolve(here, '../../dashboard') // apps/cli/src -> apps/dashboard

  const url = `http://localhost:${args.port}`
  console.log(`postdeck: booting dashboard at ${url} (config: ${configPath})`)

  const child = spawn('pnpm', ['exec', 'next', 'dev', '--port', String(args.port)], {
    cwd: dashboardDir,
    env: { ...process.env, POSTDECK_CONFIG: configPath },
    stdio: 'inherit',
  })

  if (args.open && process.platform === 'darwin') {
    setTimeout(() => spawn('open', [url], { stdio: 'ignore' }), 2500)
  }
  child.on('exit', (code) => process.exit(code ?? 0))
}
