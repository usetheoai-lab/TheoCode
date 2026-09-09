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
 * ## `DECLARED_FLOOR` — the tracked half, and why the first version did not work
 *
 * The first version compared the declared floor only against a coverage report, and a review
 * measured it not delivering the guarantee above: with the report absent — which is every
 * `pnpm lint`, since the report is gitignored and no lint step produces one — a floor edited from
 * 59.29 to 40 exited 0. With the report present, a one-point downward edit still exited 0, because
 * a snapshot cannot tell "coverage rose a point" from "someone lowered the floor a point".
 *
 * So the floor is declared TWICE, and the two must agree:
 *
 *   - `DECLARED_FLOOR` here, tracked by git, changed only by editing this file;
 *   - `coverage.min_percent` in the thresholds file, gitignored, read by the kit's gate.
 *
 * A downward edit of the gitignored value now fails at any magnitude with no coverage report
 * needed, and lowering the floor legitimately means editing a TRACKED constant — which appears in a
 * diff and in review. That is the whole point: the reason the edit was invisible was that nothing
 * versioned knew what the number used to be.
 *
 * Two declarations of one fact is the shape `check-sdk-pin.mjs` already carries in this repository,
 * for the same reason: they pin the same thing, nothing makes them move together, so a check does.
 *
 * ## What it deliberately cannot do
 *
 * CI cannot compare them. The thresholds file lives under `.claude/`, which this repository does
 * not version, so in a CI checkout it is absent and this SKIPs — loudly, naming the path, the way
 * `check-codex-parity.mjs` does for its own absent input. **It does not make coverage a merge
 * gate.** What CI does get is `DECLARED_FLOOR` in a reviewable diff.
 *
 * Nor does it verify coverage at `pnpm lint` time. `run_validation.py` runs `npm run lint` BEFORE
 * the step that regenerates the report, so at lint time the report is from a previous run or
 * absent. Its age is printed rather than assumed, and the floor-vs-declaration check does not
 * depend on it.
 *
 * ## On the tolerance, which is narrower than it looks
 *
 * `TOLERANCE` governs ONE question: how far the measured total may rise above the floor before this
 * asks you to raise it. It has nothing to do with downward edits any more — `DECLARED_FLOOR`
 * catches those exactly. Zero here would redden lint on every coverage-improving commit until
 * someone edited a gitignored file, and a gate people bypass is the failure this ecosystem exists
 * to prevent.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Both layouts, in the order `coverage_gate.py::_THRESHOLD_FILES` tries them.
 *
 * The order is not cosmetic. Reading only the second means that in the kit's own standalone layout
 * — where `rules/` sits at the root with no `.claude/` wrapper — this reports `SKIPPED … gitignored,
 * so this is expected in CI` while a completely different floor is in force. That message asserts a
 * reason it did not observe, which is the defect it exists to catch, one level up.
 */
const FLOOR_PATHS = ['rules/code-quality-thresholds.txt', '.claude/rules/code-quality-thresholds.txt']
const REPORT_PATH = 'coverage/coverage-summary.json'
const KEY = 'coverage.min_percent'

/**
 * Every boundary Python's `str.splitlines()` recognises, which is what the gate splits on.
 *
 * F-guard-10-r3. `split('\n')` looks equivalent and is not: `splitlines()` also breaks on CR, VT,
 * FF, the three file/group/record separators, NEL, and the two Unicode line/paragraph separators.
 * A declaration hidden behind any of them is AUTHORITATIVE for the gate and INVISIBLE here.
 * Measured on the same file, byte for byte:
 *
 *     "# ratchet note\rcoverage.min_percent = 5\ncoverage.min_percent = 59.29\n"
 *       checker -> "floor 59.29% agrees with DECLARED_FLOOR"   exit 0
 *       gate    -> (5, 'project')
 *
 * Effective floor 5, reported as AGREEMENT rather than as doubt, with no versioned file touched —
 * which is the exact premise the second declaration exists to provide. Unbounded, and needing only
 * a stray CR from mixed line endings. Two parsers of one file must split it the same way.
 */
const LINE_BREAKS = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/

/**
 * The floor this repository has agreed to, tracked by git.
 *
 * Lowering it is a reviewable edit to a versioned file, by construction. Raising it is the only
 * change the ratchet welcomes; both must be mirrored into the thresholds file the kit's gate reads.
 */
export const DECLARED_FLOOR = 59.29

/** Percentage points the total may sit above the floor before a re-declaration is asked for. */
const TOLERANCE = 1

/**
 * The declared floor, or why it could not be read.
 *
 * Absent and malformed are DIFFERENT results on purpose: one means "declare it", the other means
 * "the line you wrote does not work", and `coverage_gate.py` turns both into the same silent 80.
 */
export function parseFloor(text) {
  const malformed = []
  for (const raw of text.split(LINE_BREAKS)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const [key, ...rest] = line.split('=')
    if (key.trim() !== KEY) continue
    const value = rest.join('=').trim()
    // Not `Number(value)`: it takes `0x3B` and `0b11`, which float() rejects, so the checker would
    // announce "LOWERED" while the gate had actually fallen back to 80. This is the decimal grammar
    // both accept. `nan`/`inf` are rejected on purpose — float() takes them, and a threshold of nan
    // makes `percent >= threshold` False for every coverage, so the gate would fail everything;
    // refusing it here is the one place this checker protects the gate rather than mirroring it.
    const number = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value) ? Number(value) : Number.NaN
    if (!Number.isFinite(number)) {
      // Keep scanning, exactly as `resolve_threshold` does: it catches ValueError and `continue`s,
      // so a bad line followed by a good one resolves to the good one. Failing here instead would
      // redden the lint chain over a file the gate reads correctly.
      malformed.push(value)
      continue
    }
    return { value: number }
  }
  if (malformed.length > 0) {
    return {
      error:
        `\`${KEY}\` is declared as \`${malformed[0]}\`, which is not a number, and no later line ` +
        'declares it either. The kit parses the value with float() and falls back to 80 when that ' +
        'raises — silently. Keep the line bare and put the reasoning on # lines above it.',
    }
  }
  return { error: `no \`${KEY}\` declaration in the thresholds file — the gate will use its default of 80` }
}

/**
 * Whether the gitignored declaration still agrees with the tracked one.
 *
 * This is the check that does not need a coverage report, and therefore the only one that runs on
 * every `pnpm lint`. Accepting what `Number()` accepts keeps it from rejecting a line the gate
 * reads fine — `59.`, `.59`, `1e2` and `+59` are all valid to Python's float().
 */
export function compareToDeclared(floor, declared = DECLARED_FLOOR) {
  if (floor === declared) return { status: 'OK' }
  const direction = floor < declared ? 'LOWERED' : 'raised'
  return {
    status: 'FAIL',
    message:
      `the thresholds file says ${floor}% and DECLARED_FLOOR in this file says ${declared}% — ` +
      `the floor was ${direction} in the thresholds file only. Both must move together: the ` +
      'tracked constant is what makes the change visible in a diff.',
  }
}

/**
 * Total line coverage from istanbul's `json-summary`, or `null` when it is unreadable.
 *
 * The gate tries four artifact shapes; this reads the one this repository's reporter emits. Saying
 * "as the gate reads it" overstated that.
 */
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

/** The report's age in whole minutes, or `null` when it is unreadable. */
function ageMinutes(path) {
  try {
    return Math.round((Date.now() - statSync(path).mtimeMs) / 60000)
  } catch {
    return null
  }
}

/** Read a file, or `null`. `existsSync` says a path exists; it does not say it can be read. */
function readOrNull(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    // A directory where a file was expected (EISDIR), a permission error, a broken symlink. The
    // sibling checker documents this guard; the first version of this file omitted it and a stray
    // directory took down the whole lint chain with a raw stack trace.
    return null
  }
}

function main() {
  const root = process.env['COVERAGE_FLOOR_ROOT'] ?? join(dirname(fileURLToPath(import.meta.url)), '..')
  const say = (line) => process.stdout.write(`${line}\n`)

  // F-guard-11-r3: the gate does not stop at the first file that EXISTS — it stops at the first
  // that yields a usable value, and keeps looking otherwise. Stopping earlier reported a failure
  // ("the gate will use its default of 80") about a configuration the gate reads correctly, which
  // is the same over-claim as F-guard-4 reintroduced by the fix for F-guard-3.
  const present = FLOOR_PATHS.map((relative) => join(root, relative)).filter((path) => existsSync(path))
  if (present.length === 0) {
    say(
      `[coverage-floor] SKIPPED — no ${FLOOR_PATHS.join(' or ')}. ` +
        `The tracked floor is ${DECLARED_FLOOR}%; nothing here to compare it against.`,
    )
    return 0
  }

  let parsed = { error: `no readable ${KEY} in ${present.join(' or ')}` }
  for (const path of present) {
    const text = readOrNull(path)
    if (text === null) continue
    const attempt = parseFloor(text)
    if (attempt.value !== undefined) {
      parsed = attempt
      break
    }
    if (parsed.error === undefined) continue
    parsed = attempt
  }
  if (parsed.error) {
    say(`[coverage-floor] ${parsed.error}`)
    return 1
  }

  // First, and without needing a coverage report: do the two declarations of the floor agree?
  const agreement = compareToDeclared(parsed.value)
  if (agreement.status !== 'OK') {
    say(`[coverage-floor] ${agreement.message}`)
    return 1
  }

  const reportFile = join(root, REPORT_PATH)
  const reportText = existsSync(reportFile) ? readOrNull(reportFile) : null
  const measured = reportText === null ? null : readMeasured(reportText)
  const result = evaluateFloor({ floor: parsed.value, measured })

  if (result.status === 'UNMEASURED') {
    // Not a failure. `pnpm lint` runs before the step that regenerates the report, so this is the
    // ordinary case there — and the declaration check above already ran.
    say(`[coverage-floor] floor ${parsed.value}% agrees with DECLARED_FLOOR; ${result.message}`)
    return 0
  }

  const age = ageMinutes(reportFile)
  // A number without its age is a claim about now. The report is not regenerated by this checker.
  const stamp = age === null ? '' : ` (report ${age}m old)`
  say(`[coverage-floor] ${result.message}${stamp}`)
  return result.status === 'OK' ? 0 : 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main())
}
