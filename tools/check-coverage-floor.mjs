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
 * The failure modes are ASYMMETRIC:
 *
 *   - a value the gate cannot parse fails LOUDLY — it falls back to 80, so the next `/implement`
 *     FAILs and someone looks;
 *   - editing the number DOWNWARD fails SILENTLY. The gate passes, and because the thresholds file
 *     is gitignored the edit appears in no diff, no review and no CI.
 *
 * A ratchet whose own value can be lowered without anyone seeing is not a ratchet.
 *
 * ## `DECLARED_FLOOR` — the tracked half
 *
 * So the floor is declared TWICE, and the two must agree:
 *
 *   - `DECLARED_FLOOR` here, tracked by git, changed only by editing this file;
 *   - `coverage.min_percent` in the thresholds file, gitignored, read by the kit's gate.
 *
 * A downward edit of the gitignored value fails at any magnitude with no coverage report needed,
 * and lowering the floor legitimately means editing a TRACKED constant — which appears in a diff
 * and in review. The reason the edit was invisible was that nothing versioned knew what the number
 * used to be.
 *
 * Two declarations of one fact is the shape `check-sdk-pin.mjs` already carries here, for the same
 * reason: they pin the same thing, nothing makes them move together, so a check does.
 *
 * ## Why it ASKS the gate instead of parsing the file
 *
 * This used to reimplement `resolve_threshold` in JavaScript. That could not converge. Two
 * consecutive adversarial passes found character-class divergences between the two parsers, each
 * one a way to lower the effective floor while this checker reported AGREEMENT and no versioned
 * file changed — the exact premise the tracked declaration exists to provide:
 *
 *   - `split('\n')` vs Python's `splitlines()`, which also breaks on CR, VT, FF, the three
 *     file/group/record separators, NEL and U+2028/9. A declaration behind a stray CR:
 *     gate 5, checker "agrees at 59.29".
 *   - `String.trim()` vs Python's `str.strip()`, which differ on U+001C..U+001F and U+FEFF. A
 *     leading U+001F: gate 0, checker "agrees at 59.29".
 *   - `Number()` vs `float()` on `0x3B`, `1_0`, `nan`, `inf` — in both directions.
 *
 * Fixing each as it was found is not a strategy; there are more character classes than rounds of
 * review. Two parsers of one file will keep diverging, so there is now one parser, and it is the
 * one whose answer matters. `resolve_threshold` also owns the path precedence, the fall-through to
 * the next file and the numeric grammar — every one of which produced a finding while this mirrored
 * them imperfectly.
 *
 * Parsimony ladder rung 2: the thing that answers this question already exists. Ask it.
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
 * absent. Its age is printed rather than assumed, and the agreement check does not depend on it.
 *
 * ## On the tolerance, which is narrower than it looks
 *
 * `TOLERANCE` governs ONE question: how far the measured total may rise above the floor before this
 * asks you to raise it. It has nothing to do with downward edits — the agreement check catches
 * those exactly, at any magnitude. Zero here would redden lint on every coverage-improving commit
 * until someone edited a gitignored file, and a gate people bypass is the failure this ecosystem
 * exists to prevent.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Both layouts. Used ONLY to decide whether there is anything to ask about, and to name the paths
 * in the skip message — the precedence between them belongs to `resolve_threshold` now.
 *
 * Mutation-tested: reversing this list changes nothing, and that is correct rather than a gap in
 * the suite. It used to be load-bearing, and every time it was, it produced a finding.
 */
const FLOOR_PATHS = ['rules/code-quality-thresholds.txt', '.claude/rules/code-quality-thresholds.txt']
const REPORT_PATH = 'coverage/coverage-summary.json'
const KEY = 'coverage.min_percent'

/** Where `coverage_gate.py` lives, in both layouts, matching FLOOR_PATHS above. */
const GATE_DIRS = ['skills/implement/scripts', '.claude/skills/implement/scripts']

/**
 * The floor this repository has agreed to, tracked by git.
 *
 * Lowering it is a reviewable edit to a versioned file, by construction. Raising it is the only
 * change the ratchet welcomes; both must be mirrored into the thresholds file the kit's gate reads.
 *
 * MEASURED IN A CLEAN CHECKOUT, and the distinction is not pedantic. This was first declared at
 * 59.29 — the number a full run produces in the maintainer's working tree — and acceptance on the
 * v0.24.0 tag reported FAIL at 59.2. `agents-md.ts` walks ancestor directories for
 * THEO.md/AGENTS.md/CLAUDE.md until it finds `.git`, so from that working tree it reaches a context
 * file in the home directory and from a worktree in /tmp it reaches nothing. Two files cover four
 * fewer lines there. 0.09 of the original floor was never coverage of this code.
 *
 * So the number here is the ARTIFACT's, taken from a worktree at the tag. Anyone re-declaring it
 * must measure the same way; a number from a working tree is a number about a machine. The
 * underlying defect — tests that read outside the repository, which makes the total contingent on
 * where the checkout sits — is B-161.
 */
export const DECLARED_FLOOR = 59.2

/** Percentage points the total may sit above the floor before a re-declaration is asked for. */
const TOLERANCE = 1

/**
 * The floor the kit's gate will actually use, asked OF the gate.
 *
 * Returns `{ value, source }` as `resolve_threshold` does — `source` matters as much as the number:
 * `'default'` means the gate could not read the declaration at all, which is B-159's original
 * symptom and is NOT agreement.
 */
export function resolveViaGate(root, python = 'python3') {
  const script = [
    'import json,sys',
    'from pathlib import Path',
    ...GATE_DIRS.map((dir) => `sys.path.insert(0, ${JSON.stringify(join(root, dir))})`),
    'import coverage_gate as g',
    `value, source = g.resolve_threshold(Path(${JSON.stringify(root)}))`,
    'print(json.dumps({"value": value, "source": source}))',
  ].join('\n')

  try {
    const stdout = execFileSync(python, ['-c', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return JSON.parse(stdout)
  } catch (error) {
    // Python missing, the kit not installed, or the gate raising on the file it was handed. The
    // last one is worth surfacing rather than swallowing: a non-UTF-8 byte makes `resolve_threshold`
    // raise, and a checker that exits 0 there says the two agree when neither was read.
    return { error: `${error.stderr ?? error.message}`.trim().split('\n').slice(-1)[0] }
  }
}

/** Whether the gitignored declaration still agrees with the tracked one. */
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
    // `_from_json_summary` reads this exact field, already rounded. Recomputing from covered/total
    // gives 59.2963… and fails against the 59.29 the gate compares.
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

/**
 * Which file the number came from, without pretending to know when it cannot.
 *
 * `resolve_threshold` returns a value and a source kind, not a path. With one candidate present
 * that is unambiguous; with both, the gate's own precedence decides and this says so rather than
 * naming one — the previous version printed `A or B`, which reads as a guess between them.
 */
function sourceNote(present) {
  if (present.length === 1) return `(read from ${present[0]})`
  return `(from whichever of ${present.join(', ')} the gate resolves first)`
}

/** Read a file, or `null`. `existsSync` says a path exists; it does not say it can be read. */
function readOrNull(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function main() {
  const root = process.env['COVERAGE_FLOOR_ROOT'] ?? join(dirname(fileURLToPath(import.meta.url)), '..')
  const say = (line) => process.stdout.write(`${line}\n`)

  const present = FLOOR_PATHS.map((relative) => join(root, relative)).filter((path) => existsSync(path))
  if (present.length === 0) {
    say(
      `[coverage-floor] SKIPPED — no ${FLOOR_PATHS.join(' or ')}. ` +
        `The tracked floor is ${DECLARED_FLOOR}%; nothing here to compare it against.`,
    )
    return 0
  }

  const resolved = resolveViaGate(root)
  if (resolved.error !== undefined) {
    // A gate that cannot answer is not a gate that agreed.
    say(`[coverage-floor] could not ask the gate what floor it resolves: ${resolved.error}`)
    return 1
  }
  if (resolved.source !== 'project') {
    // Says what was observed and stops there. `source === 'default'` means the gate read no usable
    // declaration; it does not say whether the key was absent, malformed, or hidden behind a
    // separator this checker no longer tries to recognise. Naming a cause it did not observe is the
    // defect this whole file exists to catch, one level up.
    say(
      `[coverage-floor] the gate resolves ${resolved.value}% from '${resolved.source}' — it read no ` +
        `usable ${KEY} from ${present.join(' or ')}, so the tracked floor of ${DECLARED_FLOOR}% is ` +
        'not in force.',
    )
    return 1
  }

  const agreement = compareToDeclared(resolved.value)
  if (agreement.status !== 'OK') {
    // F-guard-3: naming the file matters when both layouts are present — "the thresholds file"
    // does not say which one, and the remedy is an edit to a specific path.
    say(`[coverage-floor] ${agreement.message} ${sourceNote(present)}`)
    return 1
  }

  const reportFile = join(root, REPORT_PATH)
  const reportText = existsSync(reportFile) ? readOrNull(reportFile) : null
  const measured = reportText === null ? null : readMeasured(reportText)
  const result = evaluateFloor({ floor: resolved.value, measured })

  if (result.status === 'UNMEASURED') {
    // Not a failure. `pnpm lint` runs before the step that regenerates the report, so this is the
    // ordinary case there — and the agreement check above already ran without needing one.
    say(`[coverage-floor] floor ${resolved.value}% agrees with DECLARED_FLOOR ${sourceNote(present)}; ${result.message}`)
    return 0
  }

  const age = ageMinutes(reportFile)
  // The OK path names its source too. A checker that only says where it read when it disagrees
  // leaves the agreeing case unauditable, which is the half of F-guard-3 the first fix missed.
  // A number without its age is a claim about now. This checker does not regenerate the report.
  const stamp = age === null ? '' : ` (report ${age}m old)`
  say(`[coverage-floor] ${result.message} ${sourceNote(present)}${stamp}`)
  return result.status === 'OK' ? 0 : 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main())
}
