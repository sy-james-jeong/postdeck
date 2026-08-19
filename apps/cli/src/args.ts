export interface CliArgs {
  config?: string
  port: number
  open: boolean
}

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { config: undefined, port: 3000, open: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port') out.port = Number(argv[++i])
    else if (a === '--no-open') out.open = false
    else if (a === '--config') out.config = argv[++i]
  }
  return out
}
