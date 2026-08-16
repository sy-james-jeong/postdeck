export interface FileStore {
  list(dir: string): Promise<string[]>
  read(path: string): Promise<string>
  write(path: string, content: string, opts: { message: string }): Promise<void>
}
