#!/usr/bin/env node
/**
 * What is out of date in the `@theokit/*` dependencies this repository declares.
 *
 * WHY THIS FILE EXISTS RATHER THAN A CALL TO `pnpm outdated`.
 *
 * `pnpm outdated` is the right tool and it does not answer this question. Measured on pnpm 11.22.0,
 * 2026-08-25, in this repository:
 *
 *     pnpm outdated -r          -> 8 rows, every one of them a root `devDependencies` entry
 *     pnpm outdated -r --prod   -> empty
 *     pnpm --filter @theocode/agent outdated  -> empty
 *
 * The `@theokit/*` packages are `dependencies` of the four workspace packages, so all of them fall
 * in the half that reports nothing — `@theokit/agents` sat at 10.1.0 with 11.0.0 published and the
 * command said the tree was current. That is worse than no command: a check that reports clean
 * when it cannot see is believed.
 *
 * So the registry lookup is delegated (`pnpm view`, one process per package — not a hand-rolled
 * registry client), and what this file owns is the part that was missing: enumerating every
 * manifest in the workspace, including the ones `outdated` skips.
 *
 * Exit codes are for a human and for CI both: 0 = everything current, 1 = an update exists, 2 = the
 * check could not run. Never 0 on an error — see `rules/error-handling.md` § 1.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCOPE = '@theokit/'
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

/** Every manifest this workspace owns: the root plus each `packages/*`. */
function manifests() {
  const found = [{ label: 'theocode (root)', path: join(ROOT, 'package.json') }]
  const packagesDir = join(ROOT, 'packages')
  if (!existsSync(packagesDir)) {
    throw new Error(`no packages/ directory at ${packagesDir} — is this the repository root?`)
  }
  for (const entry of readdirSync(packagesDir).sort()) {
    const path = join(packagesDir, entry, 'package.json')
    if (existsSync(path)) found.push({ label: `packages/${entry}`, path })
  }
  return found
}

/** Every `@theokit/*` range declared anywhere, with who declares it. */
function declaredRanges() {
  const byPackage = new Map()
  for (const { label, path } of manifests()) {
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    for (const field of DEP_FIELDS) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (!name.startsWith(SCOPE)) continue
        const entry = byPackage.get(name) ?? { name, declarations: [] }
        entry.declarations.push({ label, field, range })
        byPackage.set(name, entry)
      }
    }
    // `overrides` pins a transitive version and is a declaration like any other: it is the reason
    // `@theokit/presenter` is at 0.7.0, and a reader who saw only `packages/cli` would not know it.
    for (const [name, range] of Object.entries(manifest.overrides ?? {})) {
      if (!name.startsWith(SCOPE)) continue
      const entry = byPackage.get(name) ?? { name, declarations: [] }
      entry.declarations.push({ label, field: 'overrides', range })
      byPackage.set(name, entry)
    }
  }
  return [...byPackage.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * What is on disk right now — the answer `pnpm outdated` calls `current`.
 *
 * Read from the manifest the installer linked into the declaring package, not through
 * `require.resolve`: this repository is ESM and the resolver would have to be given a base URL that
 * differs per workspace. The link is what the package actually loads, so reading it asks the
 * question directly.
 */
function installedVersion(name, label) {
  const dir = label.startsWith('packages/') ? label.slice('packages/'.length) : '.'
  const manifest = join(ROOT, dir === '.' ? '.' : join('packages', dir), 'node_modules', name, 'package.json')
  if (!existsSync(manifest)) return undefined
  try {
    return JSON.parse(readFileSync(manifest, 'utf8')).version
  } catch {
    return undefined
  }
}

/** The one version every declaration of `name` resolved to, or the disagreement if they differ. */
function installedAcross(declarations, name) {
  const seen = new Map()
  for (const d of declarations) {
    const version = installedVersion(name, d.label)
    if (version === undefined) continue
    const who = seen.get(version) ?? []
    who.push(d.label)
    seen.set(version, who)
  }
  if (seen.size === 0) return { version: undefined, split: false }
  if (seen.size === 1) return { version: [...seen.keys()][0], split: false }
  // Two workspaces on different versions of the same package is worth SAYING rather than
  // collapsing to whichever was read first — it is how a surface ends up compiled against a
  // contract the other one does not have.
  return {
    version: [...seen.entries()].map(([v, who]) => `${v} (${who.join(', ')})`).join(' / '),
    split: true,
  }
}

/** The published `latest`, via pnpm — the registry client is not reimplemented here. */
function publishedLatest(name) {
  const out = execFileSync('pnpm', ['view', name, 'version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const version = out.trim().split('\n').pop()?.trim()
  if (version === undefined || version.length === 0) {
    throw new Error(`\`pnpm view ${name} version\` returned nothing`)
  }
  return version
}

function majorOf(version) {
  return Number(version.split('.')[0])
}

function main() {
  const json = process.argv.includes('--json')
  const rows = []
  const failures = []

  for (const { name, declarations } of declaredRanges()) {
    const { version: installed, split } = installedAcross(declarations, name)
    let latest
    try {
      latest = publishedLatest(name)
    } catch (err) {
      failures.push({ name, reason: err instanceof Error ? err.message : String(err) })
      continue
    }
    rows.push({
      name,
      installed: installed ?? '(not installed)',
      latest,
      // A major bump is called out because it is the one that cannot be taken by editing a caret:
      // it is a migration, and it needs the suite run against it before anyone believes it.
      split,
      major: !split && installed !== undefined && majorOf(latest) > majorOf(installed),
      current: !split && installed === latest,
      declarations,
    })
  }

  if (json) {
    process.stdout.write(`${JSON.stringify({ rows, failures }, null, 2)}\n`)
  } else {
    const width = (pick) => Math.max(...rows.map((r) => pick(r).length), 0)
    const nameWidth = Math.max(width((r) => r.name), 'package'.length)
    const installedWidth = Math.max(width((r) => r.installed), 'installed'.length)
    const latestWidth = Math.max(width((r) => r.latest), 'latest'.length)

    process.stdout.write(
      `${'package'.padEnd(nameWidth)}  ${'installed'.padEnd(installedWidth)}  ${'latest'.padEnd(latestWidth)}  declared by\n`,
    )
    for (const row of rows) {
      const mark = row.split ? '><' : row.current ? '  ' : row.major ? '!!' : ' →'
      const where = row.declarations
        .map((d) => `${d.label} ${d.range}${d.field === 'overrides' ? ' (override)' : ''}`)
        .join(', ')
      process.stdout.write(
        `${row.name.padEnd(nameWidth)}  ${row.installed.padEnd(installedWidth)}  ${row.latest.padEnd(latestWidth)}  ${mark} ${where}\n`,
      )
    }
    const behind = rows.filter((r) => !r.current)
    process.stdout.write(
      behind.length === 0
        ? `\nEvery @theokit/* dependency is at its published latest.\n`
        : `\n${behind.length} of ${rows.length} behind. \`!!\` is a MAJOR — read its changelog and run the suite before taking it.\n`,
    )
    for (const f of failures) process.stderr.write(`could not check ${f.name}: ${f.reason}\n`)
  }

  if (failures.length > 0) process.exit(2)
  process.exit(rows.some((r) => !r.current) ? 1 : 0)
}

try {
  main()
} catch (err) {
  process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(2)
}
