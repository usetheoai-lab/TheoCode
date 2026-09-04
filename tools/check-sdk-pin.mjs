#!/usr/bin/env node
/**
 * The two places that pin `@theokit/sdk` must agree.
 *
 * #69 — `package.json` carried an npm-style `overrides` block pinning `^4.63.3` while the tree
 * actually resolved `5.0.0-next.1`. Under pnpm that block is INERT (pnpm reads
 * `pnpm-workspace.yaml`), so the number sat there being wrong and reading as a control that works.
 *
 * Two declarations remain and both are load-bearing:
 *
 *   - the root devDependency, because `tools/build-cli.mjs` copies `provider-catalog.json` out of
 *     the SDK, and pnpm is right not to hoist what nobody declared;
 *   - the `pnpm-workspace.yaml` override, because it decides what the WHOLE tree resolves to.
 *
 * They pin the same fact. Nothing makes them move together, so this does.
 *
 * A CHECK THAT FAILS, not a corrected number — the acceptance criterion the issue names, because a
 * number someone fixes by hand drifts back the next time either file is edited.
 */
import { readFileSync } from 'node:fs'

const PKG = 'package.json'
const WS = 'pnpm-workspace.yaml'
const NAME = '@theokit/sdk'

/**
 * What disagrees, or `undefined` when nothing does.
 *
 * Takes the file CONTENTS so the rule is testable without a filesystem — the guard that has no test
 * is the one that reports clean over anything.
 */
export function disagreement(pkgJson, workspaceYaml) {
  const pkg = JSON.parse(pkgJson)
  const declared = pkg.devDependencies?.[NAME] ?? pkg.dependencies?.[NAME]
  const npmOverride = pkg.overrides?.[NAME]
  // The captured value is UNQUOTED before comparing. YAML accepts `'5.0.0-next.1'` and
  // `5.0.0-next.1` as the same string, and comparing the raw capture to the JSON value reported a
  // disagreement between a version and itself — caught by running the guard rather than by reading
  // it, on the very commit that introduced it.
  const raw = new RegExp(`'?${NAME.replace('/', '\\/')}'?:\\s*(\\S+)`).exec(workspaceYaml)?.[1]
  const wsOverride = raw?.replace(/^['"]|['"]$/g, '')

  // ANY npm `overrides` block, not only this package's.
  //
  // The rule is about the FILE, not the entry: this repository declares `packageManager: pnpm`, and
  // pnpm reads its overrides from pnpm-workspace.yaml. Every key in a `package.json` overrides block
  // is therefore inert here — #69 was one of them being inert AND wrong, but a redundant one is the
  // same defect with a luckier value: it reads as a control that works.
  const names = Object.keys(pkg.overrides ?? {})
  if (names.length > 0) {
    const shown = npmOverride === undefined ? names.join(', ') : `${NAME} (${npmOverride})`
    return (
      `${PKG} has an npm \`overrides\` block — ${shown}. pnpm does not read it, so it is inert; ` +
      `${WS} is the one that decides. Delete the block and pin there if the pin is wanted.`
    )
  }
  if (declared === undefined) return undefined
  if (wsOverride === undefined) {
    return `${PKG} declares ${NAME}@${declared} and ${WS} has no \`${NAME}\` override to hold the whole tree to it`
  }
  if (declared !== wsOverride) {
    return `${PKG} declares ${NAME}@${declared} while ${WS} overrides the tree to ${wsOverride} — the build would read a different copy than everything else`
  }
  return undefined
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problem = disagreement(readFileSync(PKG, 'utf8'), readFileSync(WS, 'utf8'))
  if (problem !== undefined) {
    process.stderr.write(`${problem}\n`)
    process.exit(1)
  }
  if (!process.argv.includes('--quiet')) process.stdout.write(`${NAME}: one pin, agreed in both files\n`)
}
