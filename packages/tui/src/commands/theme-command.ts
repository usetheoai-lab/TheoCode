/**
 * `/theme` — reporting the colour decision, and now changing it.
 *
 * Codex offers `/theme` as a live picker. This one used to REFUSE every argument, because the base
 * was resolved once at module load and handed to the provider as a constant — a command that
 * accepted `light` and left the terminal exactly as it was would have been read as "applied", and
 * the next thing that user reported was the colour as a rendering bug. `theme-session.tsx` removed
 * that constraint by putting a one-slot override in front of the environment's answer, so the
 * refusal has nothing left to protect and the command switches.
 *
 * What survives from the refusing version is the shape of its honesty. An unknown word is still
 * turned down by NAMING the vocabulary rather than being dropped, and the report still says which
 * input decided the colour — including a `THEOCODE_THEME` value that was thrown away to get there.
 *
 * The switch is REMEMBERED (#72), and the message says which of the two happened. It used to be
 * session-only, on the argument that a durable preference belongs in `THEOCODE_THEME` "where it can
 * be reviewed". That argument was about reviewability, and a file this command writes is at least as
 * reviewable as an environment variable — more so, because the operator does not have to first learn
 * the variable exists and then edit a shell profile. What survives is the honesty: the toast names
 * the file, says the variable still overrides it, and says plainly when the write did not land.
 */
import type { ToastPayload } from '../screen-types.js'
import { THEME_BASES, type ThemeBase, type ThemeResolution } from '../theme-base.js'
import { sessionThemeBase, setSessionThemeBase } from '../theme-session.js'
import { THEME_RESOLUTION } from '../theme.js'

/**
 * How the active theme reads: the base being drawn, what decided it, and the value thrown away.
 *
 * Shared with the `theme` row of `/status` rather than written twice. The rejected-value clause is
 * the half that would drift: the resolver falls back silently so a typo cannot end the session, and
 * these two lines are the only places that turn that fallback back into something a user can see.
 *
 * `override` is a SECOND fact, not a replacement for the first, so the line carries both. "It is
 * light" and "the terminal would have given you dark" answer different questions, and collapsing
 * them would leave a user who has forgotten they typed `/theme` unable to tell a session override
 * from an environment they need to go and fix.
 */
export function themeResolutionLine(resolution: ThemeResolution, override?: ThemeBase): string {
  const rejected =
    resolution.invalid === undefined
      ? ''
      : ` — ignored THEOCODE_THEME=${resolution.invalid}, expected ${THEME_BASES.join(' | ')}`
  const environment = `${resolution.base} (${resolution.source})${rejected}`
  if (override === undefined) return environment
  return `${override} (/theme, this session) — the environment resolves ${environment}`
}

/** Said on the branches that did not switch: the answer to "so how do I change it?" is one line. */
const HOW_TO_CHANGE =
  `/theme ${THEME_BASES.join(' | ')} switches this session; ` +
  'set THEOCODE_THEME to the same values to make it the default at launch'

/**
 * `/theme` reports; `/theme <base>` switches; `/theme <anything else>` is refused by name.
 *
 * The refusal is `error` rather than `info` and the switch is `success` rather than either: the
 * variant is the only part of a toast read at a glance, and an informational tone on an unperformed
 * action is exactly what makes a no-op look like it worked.
 */
export function handleTheme(
  arg: string,
  setToast: (toast: ToastPayload) => void,
  /**
   * Injected, and REQUIRED — not defaulted to the real writer.
   *
   * It did write into the operator's real home, once: with a default, three existing call sites kept
   * the two-argument form and running the suite left a `tui-theme` file on the machine of whoever
   * ran it, silently changing the colour they would see at the next launch. A default seam is a seam
   * you have to remember; a required one is one the compiler asks about.
   */
  persist: (base: ThemeBase) => boolean,
  describeStore: () => string,
): void {
  const requested = arg.trim()
  if (requested.length === 0) {
    setToast({
      message: `theme: ${themeResolutionLine(THEME_RESOLUTION, sessionThemeBase())} — ${HOW_TO_CHANGE}`,
      variant: 'info',
    })
    return
  }
  // Lower-cased before the lookup because `DARK` is the value, typed the way a shell exports it.
  // Calling it an unknown word would send the user to fix a spelling that is already right.
  const wanted = requested.toLowerCase()
  const known = THEME_BASES.find((base) => base === wanted)
  if (known === undefined) {
    setToast({
      message: `"${requested}" is not a theme — expected ${THEME_BASES.join(' | ')}`,
      variant: 'error',
    })
    return
  }
  setSessionThemeBase(known)
  // #72 — the switch is remembered. Reported honestly on both branches rather than promised: a
  // failed write still leaves the session switched, and telling the operator it will persist when it
  // will not is the one outcome worse than not persisting at all.
  const kept = persist(known)
  setToast({
    message: kept
      ? `theme: ${known} — remembered for next launch too (${describeStore()}); THEOCODE_THEME still overrides it`
      : `theme: ${known} — this session only; ${describeStore()} could not be written`,
    variant: 'success',
  })
}
