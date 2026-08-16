import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { FileStore } from '@blogmanager/core'

const run = promisify(execFile)

export function createLocalFs(rootDir: string): FileStore {
  const abs = (p: string) => join(rootDir, p)
  return {
    async list(dir) {
      try { return await readdir(abs(dir)) } catch { return [] }
    },
    async read(path) {
      return readFile(abs(path), 'utf8')
    },
    async write(path, content, { message }) {
      await mkdir(dirname(abs(path)), { recursive: true })
      await writeFile(abs(path), content, 'utf8')
      await run('git', ['add', path], { cwd: rootDir })
      // commit; ignore "nothing to commit" when content is identical.
      try { await run('git', ['commit', '-m', message, '--', path], { cwd: rootDir }) }
      catch (e: any) { if (!/nothing to commit/i.test(e.stdout ?? e.message ?? '')) throw e }
    },
  }
}
