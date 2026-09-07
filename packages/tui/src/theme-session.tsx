/**
 * `/theme <base>` — repainting the running frame, for this session only.
 *
 * The base used to be a module constant: `theme.ts` resolved the environment at import and `App`
 * handed the result to `<TheoTUIProvider>` as a fixed prop, so nothing typed after startup could
 * change a colour. `/theme light` therefore had to be refused out loud, which is honest and still
 * leaves a light-terminal user editing an environment variable and relaunching to see the frame
 * they wanted.
 *
 * The seam is the base, not the theme. `resolveThemeBase` is already a pure function of the
 * environment, so the only thing this module adds is a value that can sit IN FRONT of its answer —
 * a one-slot override, read through `useSyncExternalStore` so React learns about the write. That is
 * the whole mechanism: mutating a module variable is not enough, and a test that only asserted the
 * variable changed would have passed against the very defect this replaces.
 *
 * NOT PERSISTED, deliberately, and the argument is `memory-switch.ts`'s: a durable preference
 * belongs in config — or here, in `THEOCODE_THEME` — where it can be reviewed, rather than in a
 * switch someone flipped once and forgot. `/theme` and `/status` both report when an override is in
 * force, so it is never a silent divergence from what the environment says.
 *
 * The override outranks `NO_COLOR`, which is the one ordering worth defending. `NO_COLOR` wins the
 * ENVIRONMENT race because it is the more specific of two ambient signals; an override is not
 * ambient at all — it was typed, just now, by the person watching the screen, and refusing it would
 * make the accessibility signal a trap rather than a default. What the environment resolved stays
 * visible in the same line, so nothing about that decision is hidden.
 */
import { useSyncExternalStore } from 'react'
import type { ReactElement, ReactNode } from 'react'

import { TheoTUIProvider } from '@theokit/tui'

import type { TheoThemeProp } from '@theokit/tui'

import type { ThemeBase } from './theme-base.js'
import { THEME_RESOLUTION, THEMES } from './theme.js'

/**
 * The one-slot override, holding a whole THEME PROP rather than a base name.
 *
 * It was a `ThemeBase`, which is all a built-in switch needs. A custom theme
 * (`~/.claude/themes/*.json`) carries a base AND an override object, and neither half survives being
 * reduced to a name. Storing the resolved prop keeps the referential stability the toolkit's
 * provider requires — it memoizes on the IDENTITY of the prop, so the object is built ONCE at
 * selection rather than per read; building it inside `activeTheme()` would re-merge and re-render
 * every consumer on every parent render.
 */
let override: TheoThemeProp | undefined
const listeners = new Set<() => void>()

/** The base `/theme` picked for this session, or `undefined` while the environment still decides. */
export function sessionThemeBase(): ThemeBase | undefined {
  return sessionBaseName
}

let sessionBaseName: ThemeBase | undefined

/**
 * What `/theme` selected, for the status line: a base name, or `custom:<slug>`.
 *
 * A second fact rather than a widening of `sessionThemeBase`, whose callers ask specifically
 * "which of the three built-in bases", and would silently start receiving a slug.
 */
let sessionLabelValue: string | undefined

export function sessionThemeLabel(): string | undefined {
  return sessionLabelValue
}

/**
 * Switch the base and tell the frame.
 *
 * The notification is the load-bearing half. Without it the next render would pick the new base up
 * by accident and the one after it would not, which is worse than never switching: a UI that
 * repaints on unrelated keystrokes is read as a rendering bug rather than as a command.
 */
export function setSessionThemeBase(base: ThemeBase): void {
  sessionBaseName = base
  sessionLabelValue = base
  setSessionTheme(THEMES[base])
}

/**
 * Switch to a whole theme prop — the path a custom theme takes.
 *
 * `label` is what `/status` and `/theme` report; a custom theme passes `custom:<slug>` so the line
 * names the file the operator wrote rather than the base it happens to sit on.
 */
export function setSessionTheme(prop: TheoThemeProp, label?: string): void {
  override = prop
  if (label !== undefined) {
    sessionLabelValue = label
    sessionBaseName = undefined
  }
  for (const listener of listeners) listener()
}

/**
 * The prop the provider is given.
 *
 * It used to return a primitive so `useSyncExternalStore` could compare snapshots by value. It now
 * returns an OBJECT, and the comparison is by identity — which is why the object is stored in the
 * slot rather than built here. `THEMES` is frozen and hoisted, and a custom prop is built once at
 * selection, so every read of an unchanged selection returns the same reference.
 */
function activeTheme(): TheoThemeProp {
  return override ?? THEMES[THEME_RESOLUTION.base]
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The provider, subscribed to the override.
 *
 * A component rather than a hook called inside `App` so the subscription and the provider it feeds
 * cannot drift apart — and so the wiring can be MOUNTED in a test. Proving `/theme` works means
 * proving a switch reaches `useTheoTheme()` in a child; a hook exported on its own would let a test
 * assert the value while `App` kept rendering the old constant.
 */
export function ThemedSurface({ children }: { children: ReactNode }): ReactElement {
  const theme = useSyncExternalStore(subscribe, activeTheme, activeTheme)
  return <TheoTUIProvider theme={theme}>{children}</TheoTUIProvider>
}

/** Test-only: drop the override so each test starts from the environment's answer. */
export function resetSessionThemeForTest(): void {
  override = undefined
  sessionBaseName = undefined
  sessionLabelValue = undefined
}

/**
 * Test-only: how many frames are listening.
 *
 * Exposed because the unsubscribe is otherwise unobservable, and "it did not throw" is not a test
 * of it — a listener left behind after unmount survives every assertion a frame can make while
 * growing the set on each remount.
 */
export function themeSubscriberCountForTest(): number {
  return listeners.size
}
