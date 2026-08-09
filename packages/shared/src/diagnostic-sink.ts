import { appendFileSync } from 'node:fs'

export function installDiagnosticSink(
  install: (sink: ((m: string) => void) | undefined) => void,
  env: NodeJS.ProcessEnv = process.env,
  writeToFile: (path: string, line: string) => void = (c, l) => {
    appendFileSync(c, l)
  },
  writeToStderr: (line: string) => void = (l) => {
    process.stderr.write(l)
  },
): boolean {
  const destination = env.THEOCODE_DIAGNOSTICS
  if (destination === undefined || destination.trim().length === 0) return false

  if (destination === '1') {
    install((m) => {
      writeToStderr(`${m}\n`)
    })
    return true
  }

  install((m) => {
    try {
      writeToFile(destination, `${m}\n`)
    } catch (error) {
      writeToStderr(
        `diagnostics: failed to write to ${destination}: ${error instanceof Error ? error.message : String(error)}\n`,
      )
    }
  })
  return true
}
