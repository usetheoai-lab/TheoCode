#!/usr/bin/env node
// M61 — build the distributable `exec` bundle: a single self-contained ESM file that runs
// goal/review/run/sessions WITHOUT tsx or the dev toolchain. Mirrors the repo's `acp:bundle` precedent
// (esbuild ESM). ESM is mandatory — a CJS bundle breaks `import.meta.url` (SDK persistence → "path
// undefined"). The one native runtime dep, node-pty, is EXTERNAL (loaded via createRequire, esbuild does
// not follow it) and only touched by run/resume's interactive_shell — goal/review never need it.
import { chmodSync, copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')
const outfile = join(distDir, 'theocode.mjs')

await build({
  entryPoints: [join(root, 'packages', 'cli', 'src', 'main.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Native / optional deps stay external: node-pty (loaded via createRequire, not bundlable), better-sqlite3
  // (optional; the SDK falls back to the built-in node:sqlite), and any raw `.node` addon.
  // `proper-lockfile` is here for a DIFFERENT reason than the native ones, and that reason is worth
  // writing down: it is CJS and calls `require('path')` at load time. Inlined into an ESM bundle, that
  // `require` becomes esbuild's shim, which throws `Dynamic require of "path" is not supported` — and
  // the SDK, which loads the package with `await import()` inside a try, falls into the failure branch
  // and CARRIES ON WITHOUT a cross-process lock. Measured 2026-08-05: the bundle warned `could not be
  // loaded` while the same turn under `tsx` warned nothing at all. We run the TUI, exec and ACP over
  // the same sessions directory, so a lock that is silently off is a race, not a detail.
  external: ['node-pty', 'better-sqlite3', 'proper-lockfile', '*.node'],
  // A shebang makes the artifact directly executable (`./dist/exec.mjs`); chmod below sets the exec bit.
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'warning',
})

chmodSync(outfile, 0o755)

// Review F1: the SDK reads `provider-catalog.json` via `import.meta.url` → next to the running file, i.e.
// `dist/provider-catalog.json`. It is a DATA asset esbuild does not bundle, so copy it beside the bundle —
// otherwise auto-compaction (context-window management) is silently disabled in every model mode. Resolved
// from the SDK's real dist via createRequire so the path holds regardless of hoisting.
const sdkRoot = dirname(createRequire(import.meta.url).resolve('@theokit/sdk/package.json'))
copyFileSync(join(sdkRoot, 'dist', 'provider-catalog.json'), join(distDir, 'provider-catalog.json'))

process.stdout.write(`built ${outfile} (+ provider-catalog.json)\n`)
