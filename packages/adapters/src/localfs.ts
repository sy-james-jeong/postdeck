import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { FileStore } from '@postdeck/core'

const run = promisify(execFile)

export function createLocalFs(rootDir: string): FileStore {
  const abs = (p: string) => {
    const target = resolve(rootDir, p)
    const rootWithSep = rootDir.endsWith(sep) ? rootDir : rootDir + sep
    if (target !== rootDir && !target.startsWith(rootWithSep)) {
      throw new Error(`path escapes root: ${p}`)
    }
    return target
  }
  return {
    async list(dir) {
      try { return await readdir(abs(dir)) }
      catch (e: any) { if (e?.code === 'ENOENT') return []; throw e }
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
