export function note(message: string): void {
  process.stderr.write(`[hooks] ${message}\n`)
}
