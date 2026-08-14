import { installDiagnosticSink as installFrameworkSink } from '@theokit/agents/doctor'

/**
 * The diagnostics sink, reduced to the one thing that is genuinely ours: the variable name.
 *
 * The mechanism — read a destination, route to stderr or to a file, never take the run down when
 * that file cannot be written — moved to `@theokit/agents/doctor` and was deleted here. What could
 * not move is the KEY: the framework reads `THEOKIT_DIAGNOSTICS`, and this product's operators have
 * `THEOCODE_DIAGNOSTICS` in their shells and their scripts. Adopting the framework's name would be a
 * breaking change disguised as a refactor, and it would fail silently — diagnostics would simply
 * stop appearing, which is the worst way for a debugging aid to break.
 *
 * So this is the adapter the deletion ledger anticipated: the file survives, ~28 lines lighter, and
 * now states exactly which part of the old module was worth keeping.
 */
export function installDiagnosticSink(
  install: (sink: ((m: string) => void) | undefined) => void,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const result = installFrameworkSink({
    // Translated, not forwarded. The framework's contract is stated in terms of its own key; handing
    // it this process's whole environment would have it read a variable nobody here sets.
    env: { THEOKIT_DIAGNOSTICS: env.THEOCODE_DIAGNOSTICS },
    install,
    onWarn: (message) => process.stderr.write(`diagnostics: ${message}\n`),
  })

  return result.kind !== 'off'
}
