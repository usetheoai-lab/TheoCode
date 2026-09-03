/**
 * B-142 — the sweep runs in another process, because `void` cannot make synchronous work async.
 *
 * An independent review measured the in-process trigger against the tree this repository itself
 * cites as measured — 13 269 projects (`filesystem.ts:31-38`) — and the event loop was blocked for
 * 37.1 s cold, 4.9–13.2 s warm. `planAllProjectsOnDisk` is declared `async`, but its body runs
 * synchronously until the first `await`, and `classifyProjects` is invoked eagerly while the
 * argument object is built. So `void collectSessionsAutomatically(...)` deferred the tail of a
 * function whose tail was empty, and the comment claiming the operator never waits was false.
 *
 * No scheduling fixes this: the sweep is synchronous JavaScript inside a dependency. Another process
 * is the mechanism, and it is the only one.
 *
 * What the child runs is the command that ALREADY EXISTS — `sessions gc --all-projects` — not a
 * second implementation of the path that deletes a user's data. The parent keeps the decision: is it
 * enabled, is it due, and is this the first sweep (which must not apply, B-139). The child only
 * works.
 */

export interface SweepCommandInput {
  /** Whether the child deletes. False on the first sweep — see B-139. */
  readonly apply: boolean
  /** `process.execPath` — the Node binary currently running. */
  readonly execPath: string
  /** `process.argv[1]` — whatever entry point started this process, bundle or `tsx` source. */
  readonly script: string | undefined
}

export interface SweepCommand {
  readonly command: string
  readonly args: readonly string[]
}

export function buildSweepCommand(input: SweepCommandInput): SweepCommand {
  if (input.execPath.trim() === '') {
    throw new Error('session gc: refusing to spawn a sweep with an empty executable')
  }
  if (input.script === undefined || input.script.trim() === '') {
    // `process.argv[1]` is undefined in some embeddings. Spawning the Node binary with no script
    // starts an idle REPL that never exits — one leaked process per launch, forever, doing nothing.
    throw new Error('session gc: refusing to spawn a sweep with no script to run')
  }
  return {
    command: input.execPath,
    args: [
      input.script,
      'sessions',
      'gc',
      '--all-projects',
      ...(input.apply ? ['--apply'] : []),
    ],
  }
}
