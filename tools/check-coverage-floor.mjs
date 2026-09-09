#!/usr/bin/env node
/**
 * The declared coverage floor must still describe the tree it was declared against.
 *
 * B-159 — `/implement`'s validation gate enforces a total-line-coverage floor. This repository
 * declared none, so `coverage_gate.py` fell back to `DEFAULT_MIN_PERCENT = 80` and reported its
 * source as `default`: a number nobody here chose, failing every plan that reached the gate. The
 * fix was to declare `coverage.min_percent` at exactly the measured total, with no slack.
 *
 * ## Why the declaration alone was not enough
 *
 * The 2026-09-09 review found the same gap from four independent directions, and the reason it is
 * worth code rather than a note is that the two failure modes are ASYMMETRIC:
 *
 *   - a trailing comment on the value fails LOUDLY — `coverage_gate.py` does `float()` on
 *     everything right of the `=`, raises, hits `continue`, and the floor reverts to 80, so the
 *     next `/implement` FAILs and someone looks;
 *   - editing the number DOWNWARD fails SILENTLY. The gate passes, and because
 *     `.claude/rules/code-quality-thresholds.txt` is gitignored the edit appears in no diff, no
 *     review and no CI.
 *
 * A ratchet whose own value can be lowered without anyone seeing is not a ratchet. This makes the
 * silent case loud, on every `pnpm lint`.
 *
 * It also catches the ratchet decaying by DRIFT rather than by decision: after a run of
 * coverage-raising work, or a `@vitest/coverage-v8` major bump that re-accounts the same tree, the
 * floor and the total diverge and nothing says so until a later plan halts.
 *
 * ## What it deliberately cannot do
 *
 * CI does not run it usefully. The floor lives under `.claude/`, which this repository does not
 * version, so in a CI checkout the file is absent and this SKIPs — loudly, naming the path, the way
 * `check-codex-parity.mjs` does for its own absent input. This closes the gap on a developer
 * machine and at `/implement` time. **It does not make coverage a merge gate**, and saying so here
 * is cheaper than letting someone infer otherwise from the fact that it runs in `pnpm lint`.
 *
 * ## On the tolerance, which looks like slack and is not
 *
 * The FLOOR keeps zero slack: `coverage_gate.py` compares `percent >= threshold` exactly, and this
 * file does not touch that. `TOLERANCE` is the width of the window before this checker asks you to
 * RAISE the floor. Zero there would redden lint on every coverage-improving commit until someone
 * edited a gitignored file — and a gate people bypass is the failure this ecosystem exists to
 * prevent.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FLOOR_PATH = '.claude/rules/code-quality-thresholds.txt'
const REPORT_PATH = 'coverage/coverage-summary.json'
const KEY = 'coverage.min_percent'

/** Percentage points the total may sit above the floor before a re-declaration is asked for. */
const TOLERANCE = 1

/**
 * The declared floor, or why it could not be read.
 *
 * Absent and malformed are DIFFERENT results on purpose: one means "declare it", the other means
 * "the line you wrote does not work", and `coverage_gate.py` turns both into the same silent 80.
 */
export function parseFloor(text) {
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const [key, ...rest] = line.split('=')
    if (key.trim() !== KEY) continue
    const value = rest.join('=').trim()
    if (!/^[0-9]+(\.[0-9]+)?$/.test(value)) {
      return {
        error:
          `\`${KEY}\` is declared as \`${value}\` — trailing text after the number. ` +
          'The kit parses it with float() and falls back to 80 on failure, silently. ' +
          'Keep the line bare and put the reasoning on # lines above it.',
      }
    }
    return { value: Number(value) }
  }
  return { error: `no \`${KEY}\` declaration in ${FLOOR_PATH} — the gate will use its default of 80` }
}

/** Total line coverage as the Python gate reads it, or `null` when the report is unreadable. */
export function readMeasured(reportJson) {
  try {
    // EC-2: `_from_json_summary` reads this exact field, already rounded. Recomputing from
    // covered/total gives 59.2963… and fails against the 59.29 the gate compares.
    const pct = JSON.parse(reportJson)?.total?.lines?.pct
    return typeof pct === 'number' ? pct : null
  } catch {
    return null
  }
}

/** Whether the declared floor still describes the measured tree. */
export function evaluateFloor({ floor, measured, tolerance = TOLERANCE }) {
  if (measured === null || measured === undefined) {
    // Never `OK`: a measurement that could not be read must not read as agreement.
    return { status: 'UNMEASURED', message: `no parseable ${REPORT_PATH}; floor ${floor}% was NOT verified` }
  }
  if (floor > measured) {
    return {
      status: 'FAIL',
      message:
        `the floor ${floor}% is above the measured total ${measured}% — every plan halts here. ` +
        'Either the tree regressed, or the floor was declared against a different one ' +
        '(a coverage-tool major bump re-accounts the same code). Re-measure and re-declare.',
    }
  }
  if (measured - floor > tolerance) {
    return {
      status: 'FAIL',
      message:
        `the floor ${floor}% now sits ${(measured - floor).toFixed(2)} points below the measured ` +
        `${measured}% — that gap is slack, and slack is what makes a floor decorative. ` +
        `Raise it to ${measured}.`,
    }
  }
  return { status: 'OK', message: `floor ${floor}%, measured ${measured}%` }
}

function main() {
  const root = process.env['COVERAGE_FLOOR_ROOT'] ?? join(dirname(fileURLToPath(import.meta.url)), '..')
  const say = (line) => process.stdout.write(`${line}\n`)

  const floorFile = join(root, FLOOR_PATH)
  if (!existsSync(floorFile)) {
    say(`[coverage-floor] SKIPPED — ${FLOOR_PATH} not found. It is gitignored, so this is expected in CI.`)
    return 0
  }

  const parsed = parseFloor(readFileSync(floorFile, 'utf8'))
  if (parsed.error) {
    say(`[coverage-floor] ${parsed.error}`)
    return 1
  }

  const reportFile = join(root, REPORT_PATH)
  const measured = existsSync(reportFile) ? readMeasured(readFileSync(reportFile, 'utf8')) : null
  const result = evaluateFloor({ floor: parsed.value, measured })

  if (result.status === 'UNMEASURED') {
    // Not a failure — `pnpm lint` does not run coverage, so this is the ordinary case there.
    say(`[coverage-floor] ${result.message}`)
    return 0
  }
  say(`[coverage-floor] ${result.message}`)
  return result.status === 'OK' ? 0 : 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)))
}
