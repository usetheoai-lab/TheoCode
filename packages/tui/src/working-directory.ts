/**
 * B-057 — the one place the terminal UI learns which directory it is working in.
 *
 * There were 23 reads of `process.cwd()` across 13 files. They agreed, because the TUI parses no
 * directory flag — which is why the review filed this MEDIUM and its `ConsentGates` instance LOW.
 * They agree by coincidence, not by construction: the day a `--cd` arrives, trust resolves for one
 * directory and configuration for another, and nothing says so.
 *
 * A module-level constant would NOT do. It is evaluated at import time, and ESM hoists every import
 * before the first statement — the exact defect B-026 fixed in the CLI's bootstrap. So this is a
 * slot, set once before the surface is built and read everywhere after.
 *
 * Setting it twice THROWS rather than winning silently. That is the B-035 lesson: a single slot that
 * quietly accepts a second write is how a surface stops being notified with no error and no warning.
 */
let selected: string | undefined

export class WorkingDirectoryAlreadySetError extends Error {
  override readonly name = 'WorkingDirectoryAlreadySetError'
  readonly code = 'working_directory_already_set' as const

  constructor(current: string, attempted: string) {
    super(
      `the working directory is already set to ${current} and cannot be changed to ${attempted}: ` +
        'trust, configuration and the session pointer are all resolved from it, and moving it ' +
        'mid-run would leave them describing different directories.',
    )
  }
}

/** Called ONCE, before the surface is composed. */
export function setWorkingDirectory(dir: string): void {
  if (selected !== undefined && selected !== dir) {
    throw new WorkingDirectoryAlreadySetError(selected, dir)
  }
  selected = dir
}

/** The directory this run works in. Falls back to the process one until something sets it. */
export function workingDirectory(): string {
  return selected ?? process.cwd()
}

/** Test-only: forget the selection so each test starts from the same state. */
export function resetWorkingDirectoryForTest(): void {
  selected = undefined
}
