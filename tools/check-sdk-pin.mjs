#!/usr/bin/env node
/**
 * The two places that pin `@theokit/sdk` must agree.
 *
 * #69 — `package.json` carried an npm-style `overrides` block pinning `^4.63.3` while the tree
 * actually resolved `5.0.0-next.1`. Under pnpm that block is INERT (pnpm reads
 * `pnpm-workspace.yaml`), so the number sat there being wrong and reading as a control that works.
 *
 * Three declarations now, all load-bearing:
 *
 *   - the root devDependency, because `tools/build-cli.mjs` copies `provider-catalog.json` out of
 *     the SDK, and pnpm is right not to hoist what nobody declared;
 *   - the `pnpm-workspace.yaml` override, because it decides what the WHOLE tree resolves to;
 *   - any `packages/*` manifest that declares it, because since #70 one of them imports the SDK
 *     directly — `readSessionMessages` is the read side of a resumed session and
 *     `@theokit/agents@12.1.0` does not forward it.
 *
 * They pin the same fact. Nothing makes them move together, so this does. The third one was added
 * the moment it became possible to drift, rather than after it had: a pin nobody checks is what #69
 * was, and adding a declaration without extending the guard would have re-created it deliberately.
 *
 * A CHECK THAT FAILS, not a corrected number — the acceptance criterion the issue names, because a
 * number someone fixes by hand drifts back the next time either file is edited.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PKG = 'package.json'
const WS = 'pnpm-workspace.yaml'
const NAME = '@theokit/sdk'

/**
 * What disagrees, or `undefined` when nothing does.
 *
 * Takes the file CONTENTS so the rule is testable without a filesystem — the guard that has no test
 * is the one that reports clean over anything.
 */
export function disagreement(pkgJson, workspaceYaml, workspaceManifests = []) {
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

  // A workspace that does NOT name the SDK is silent, not wrong: three of the four packages reach it
  // only through `@theokit/agents`, and forcing them to declare a dependency they do not import would
  // be the redundant pin this guard exists to refuse.
  for (const { path, json } of workspaceManifests) {
    const manifest = JSON.parse(json)
    const pin = manifest.dependencies?.[NAME] ?? manifest.devDependencies?.[NAME]
    if (pin === undefined) continue
    if (pin !== wsOverride) {
      return `${path} declares ${NAME}@${pin} while ${WS} overrides the tree to ${wsOverride} — that package would typecheck against one copy and run against another`
    }
  }
  return undefined
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Read from disk here rather than inside `disagreement`, which stays filesystem-free so the rule
  // is testable — the guard with no test is the one that reports clean over anything.
  const manifests = readdirSync('packages', { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join('packages', e.name, 'package.json'))
    .filter((p) => existsSync(p))
    .map((p) => ({ path: p, json: readFileSync(p, 'utf8') }))
  const problem = disagreement(readFileSync(PKG, 'utf8'), readFileSync(WS, 'utf8'), manifests)
  if (problem !== undefined) {
    process.stderr.write(`${problem}\n`)
    process.exit(1)
  }
  if (!process.argv.includes('--quiet')) {
    // Counted, not assumed: `manifests.length` would report every package scanned, including the
    // three that correctly say nothing about the SDK — a number that grows when a package is added
    // and means less each time.
    const naming = manifests.filter((m) => {
      const j = JSON.parse(m.json)
      return (j.dependencies?.[NAME] ?? j.devDependencies?.[NAME]) !== undefined
    })
    const where = [PKG, WS, ...naming.map((m) => m.path)].join(', ')
    process.stdout.write(`${NAME}: one pin, agreed in ${where}\n`)
  }
}
