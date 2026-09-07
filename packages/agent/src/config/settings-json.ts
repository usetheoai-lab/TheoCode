/**
 * `settings.json` — this product's configuration file, wearing Claude Code's filename.
 *
 * TOLERANCE IS DECIDED BY PROVENANCE, NOT BY A LIST. An earlier version of this module carried an
 * explicit 141-key inventory of Claude Code's settings and rejected everything else. It failed on
 * the first real file it met: `~/.claude/settings.json` on this machine, 2026-09-07, carried
 * `remote`, `tui`, `voice`, `voiceEnabled` and `feedbackSurveyState` — five keys the inventory did
 * not know, and eight tests refused to start because of them. A list of somebody else's vocabulary
 * is stale the moment they ship, and the maintenance falls on us at their cadence.
 *
 * So the rule is about WHOSE FILE IT IS. Under `.claude/`, an unknown key is theirs and is ignored
 * and reported. Under this product's own root, an unknown key is a typo and the strict schema
 * rejects it by name — which is what keeps `sandboxMode` from being silently discarded. The
 * inventory survives, doing the smaller job it is actually good for: telling an operator that a key
 * is a Claude Code setting we do not implement, rather than something we could not recognise at all.
 *
 * That filename is the whole difficulty. The file at `.claude/settings.json` is very often a real
 * Claude Code file that somebody else wrote, and both config schemas here are `.strict()`: without
 * a translation step, a valid Claude Code file makes this product refuse to start over
 * `alwaysThinkingEnabled`.
 *
 * So this module does two things and neither is validation — the schema in `config.ts` still owns
 * that:
 *
 *   1. Removes the keys that are theirs and not ours, and RETURNS THEM BY NAME. A key we ignore
 *      must be nameable, or an operator cannot tell an unsupported setting from a misspelt one.
 *      Keys that are in neither group (`sandboxMode`, a camelCase typo of `sandbox_mode`) are left
 *      in place on purpose, so the strict schema rejects them with their own name.
 *   2. Translates `hooks` from their nested-by-event dialect into ours.
 *
 * Every case in the translator came from the shape measured in this repository on 2026-09-07, not
 * from a shape imagined for the occasion. Four of them break a naive forward:
 *
 *   - `timeout` there is SECONDS; `timeout_ms` here is milliseconds. Forwarding the number gives a
 *     30ms budget and kills every hook before its interpreter starts.
 *   - `matcher: "*"` is idiomatic there and is not a regex — `requireCompilableMatcher` throws a
 *     HookError at boot. It means match-all, so it is dropped rather than forwarded.
 *   - Their event vocabulary is larger than ours: this repository's own file carries
 *     `UserPromptSubmit` and `PreCompact`, which we do not have. Those are dropped BY NAME.
 *   - One matcher group holds an array of commands, so a group fans out to N entries.
 *
 * Hooks translated here go through the same fingerprint approval gate as every other hook
 * (`hooks/hook-trust.ts`). That is the point of translating them rather than leaving them to the
 * SDK's own loader, which runs them ungated — measured as B-153.
 */
import { HOOK_EVENTS } from '../hooks/hooks-spec.js'
import { FOREIGN_SETTINGS_KEYS } from './foreign-keys.js'

interface TranslatedHook {
  readonly event: string
  readonly command: string
  readonly matcher?: string
  readonly timeout_ms?: number
}

export interface ForeignHooksRead {
  readonly hooks: readonly TranslatedHook[]
  /** What was not translated, each with the reason — never silently absent. */
  readonly dropped: readonly string[]
}

export interface TranslateOptions {
  /**
   * The keys this product's own schema defines. Supplied by the caller rather than imported, so this
   * module does not depend on `config.ts` — which depends on it.
   */
  readonly ownKeys: readonly string[]
  /**
   * True for a file under the FOREIGN root (`.claude/`), whose vocabulary belongs to another product
   * and grows on its release cadence, not ours. There, an unknown key is ignored and reported.
   * False for a file under this product's own root, where an unknown key is a typo and the strict
   * schema must reject it by name.
   */
  readonly foreignRoot: boolean
}

export interface SettingsRead {
  /** The file in this product's own dialect, ready for `configSchema`. */
  readonly values: Record<string, unknown>
  /** Top-level keys not acted on — Claude Code settings this product does not implement. */
  readonly ignored: readonly string[]
  /**
   * Keys under the foreign root that are in NEITHER vocabulary. Reported apart from `ignored`
   * because the two mean different things to an operator: one is a setting we chose not to
   * implement, the other is very likely a misspelling of something.
   */
  readonly unrecognised: readonly string[]
  readonly droppedHooks: readonly string[]
}

/** `matcher: "*"` means every tool. It is not a regex, so it is dropped rather than forwarded. */
const MATCH_ALL = '*'

/**
 * Two conventions that are not settings in any dialect, and are present in both files measured
 * here: `$schema`, the editor's JSON Schema pointer, and a leading `_`, the way JSON files carry a
 * comment. Recognising them by shape rather than by name is a heuristic, and its failure mode is
 * bounded in a way the rejected camelCase heuristic's was not: it can only ignore a key an operator
 * deliberately wrote with a leading underscore, and no key of this product's schema has one — which
 * `settings-json.test.ts` asserts rather than assumes.
 */
/**
 * Their key name, ours, for the settings whose NAME and MEANING are both the same.
 *
 * Deliberately tiny, and it will stay tiny. `model` needs no entry — the two products spell it
 * identically. Every other apparent overlap between the two vocabularies is a name collision with a
 * different meaning behind it (`effortLevel` and `reasoning_effort` do not share a value set;
 * `sandbox.enabled` is a boolean where `sandbox_mode` is a three-value enum; `cleanupPeriodDays` is
 * a number of days where `session_gc` is on/off), and translating one of those would silently give
 * an operator a setting they did not ask for.
 *
 * `outputStyle` is the exception that earns the mechanism: same feature, same values, same files on
 * disk. Ours is snake_case only because `env-knobs` derives the variable name from the key.
 */
const SAME_SETTING_DIFFERENT_SPELLING: Readonly<Record<string, string>> = {
  outputStyle: 'output_style',
}

function isNonSettingConvention(key: string): boolean {
  return key === '$schema' || key.startsWith('_')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** One command entry: the hook, a string naming why it was dropped, or null when it is not one. */
function translateOne(
  event: string,
  matcher: string | undefined,
  entry: unknown,
): TranslatedHook | string | null {
  if (!isRecord(entry)) return null
  const type = entry['type']
  if (type !== 'command' || typeof entry['command'] !== 'string') {
    return `${event}: hook of type "${String(type)}" is not a command`
  }
  // Seconds there, milliseconds here. The unit change is the whole reason this is not a spread.
  const seconds = entry['timeout']
  return {
    event,
    command: entry['command'],
    ...(matcher !== undefined && matcher !== MATCH_ALL ? { matcher } : {}),
    ...(typeof seconds === 'number' ? { timeout_ms: seconds * 1000 } : {}),
  }
}

/** Why this event's block cannot be translated at all, or null when it can. */
function whyNotTranslatable(event: string, groups: unknown): string | null {
  if (!(HOOK_EVENTS as readonly string[]).includes(event)) {
    return `${event}: this product has no such hook event`
  }
  if (!Array.isArray(groups)) return `${event}: expected an array of matcher groups`
  return null
}

/** One event's matcher groups, fanned out: a group holds an array of commands, not one. */
function translateGroups(event: string, groups: readonly unknown[]): (TranslatedHook | string)[] {
  const out: (TranslatedHook | string)[] = []
  for (const group of groups) {
    if (!isRecord(group)) continue
    const matcher = typeof group['matcher'] === 'string' ? group['matcher'] : undefined
    const inner = Array.isArray(group['hooks']) ? group['hooks'] : []
    for (const entry of inner) {
      const one = translateOne(event, matcher, entry)
      if (one !== null) out.push(one)
    }
  }
  return out
}

export function translateForeignHooks(raw: unknown): ForeignHooksRead {
  if (!isRecord(raw)) return { hooks: [], dropped: [] }
  const hooks: TranslatedHook[] = []
  const dropped: string[] = []

  for (const [event, groups] of Object.entries(raw)) {
    const refusal = whyNotTranslatable(event, groups)
    if (refusal !== null) {
      dropped.push(refusal)
      continue
    }
    for (const one of translateGroups(event, groups as unknown[])) {
      if (typeof one === 'string') dropped.push(one)
      else hooks.push(one)
    }
  }
  return { hooks, dropped }
}

export function translateSettings(raw: unknown, opts: TranslateOptions): SettingsRead {
  if (!isRecord(raw)) return { values: {}, ignored: [], unrecognised: [], droppedHooks: [] }

  const ours = new Set(opts.ownKeys)
  const values: Record<string, unknown> = {}
  const ignored: string[] = []
  const unrecognised: string[] = []
  for (const [rawKey, value] of Object.entries(raw)) {
    const key = SAME_SETTING_DIFFERENT_SPELLING[rawKey] ?? rawKey
    if (ours.has(key)) {
      values[key] = value
    } else if (FOREIGN_SETTINGS_KEYS.has(key) || isNonSettingConvention(key)) {
      ignored.push(key)
    } else if (opts.foreignRoot) {
      // Their file, their vocabulary. Tolerated and named — never silently absorbed.
      unrecognised.push(key)
    } else {
      // Our file: leave it in place so the strict schema rejects it, with its own name in the error.
      values[key] = value
    }
  }

  // `hooks` is a name both dialects use for different shapes. Ours is an array; theirs is an object
  // keyed by event. Distinguishing by shape rather than by provenance means a file may legitimately
  // be written either way, which is what "the same filename" has to mean to be worth anything.
  let droppedHooks: readonly string[] = []
  if (isRecord(values['hooks'])) {
    if (opts.foreignRoot) {
      // NOT translated, and this is the one place tolerance stops short on purpose. The framework's
      // compatibility loader ALREADY reads `.claude/settings.json` and executes its hooks — measured
      // as B-153: settings.json present → hook fired; removed → 0; restored → fired. Translating
      // them here as well would run every one of them TWICE, and a hook is arbitrary shell.
      //
      // So the gap B-153 names — those hooks bypassing this product's per-hook fingerprint approval
      // — stays open, and is reported rather than closed by a change that would be worse than it.
      // Closing it means taking the hooks away from that loader first, which is a security change
      // with its own measurement pass, not a side effect of renaming a config file.
      const { dropped } = translateForeignHooks(values['hooks'])
      droppedHooks = [
        ...dropped,
        'hooks under .claude/ are run by the compatibility loader, not by this file — ' +
          'translating them here would execute each one twice',
      ]
      delete values['hooks']
    } else {
      const read = translateForeignHooks(values['hooks'])
      values['hooks'] = read.hooks
      droppedHooks = read.dropped
    }
  }

  return { values, ignored, unrecognised, droppedHooks }
}
