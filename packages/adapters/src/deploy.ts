import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

// Pure: the git command argv arrays a deploy runs, in order.
export function buildDeployCommands(opts: { emptyCommit?: boolean; message?: string }): string[][] {
  const cmds: string[][] = []
  if (opts.emptyCommit) cmds.push(['commit', '--allow-empty', '-m', opts.message ?? 'publish'])
  cmds.push(['push'])
  return cmds
}

export function gitToplevel(dir: string): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' }).trim()
}

export async function deployProject(repoDir: string, opts: { emptyCommit?: boolean; message?: string }): Promise<void> {
  for (const args of buildDeployCommands(opts)) {
    await run('git', args, { cwd: repoDir })
  }
}
