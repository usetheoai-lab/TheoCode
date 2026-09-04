import { homedir } from 'node:os'
import { AgentBuilder, ConfigurationError, loadMcpJson } from '@theokit/agents'

import { mcpScopes } from './mcp-scopes.js'
import { wiringRecord } from './composition-record.js'
import type { WiredCapabilities } from './wired-capabilities.js'
import { memoryEnabledForSession } from './memory-switch.js'
import { sandboxModeForSession } from './sandbox-switch.js'
import { withSandboxMode } from './config/effective-config.js'
import {
  createGenericHttpSearchAdapter,
  createQuestionTool,
  createUpdatePlanTool,
  createWebFetchTool,
  createWebSearchTool,
  createWriteStdinTool,
  withDescription,
} from '@theokit/agents/tools'
import type { CustomTool } from '@theokit/agents'
import { Provider } from '@theokit/agents'
import type { InteractiveBackend } from '@theokit/agents/interactive'

import { PtyInteractiveBackend } from '@theokit/agents-pty'
import { z } from 'zod'

import { MAX_AGGREGATE, composeInstructions, loadAgentsMd, loadUserAgentsMd } from './context/index.js'
import { loadRules, loadUserRules } from './context/index.js'
import {
  resolveEffectiveConfig,
  type EffectiveConfig,
  type ReasoningEffort,
} from './config/index.js'
import { interactiveWrapCommand } from '@theokit/agents/sandbox'
import { loadApprovedHooks } from './hooks/index.js'
import { buildHookHandlers, withBuiltinShellVeto, parseHooks } from './hooks/index.js'
import { sandboxWritePolicy } from './config/index.js'
import { resolveTrustPosture, type TrustPosture } from './config/index.js'
import { BASE_INSTRUCTIONS } from './context/index.js'
import { createAnalystSubagent, createDelegateToTeamTool } from './delegation/index.js'
import { abandonQuestion, ask } from './ask/index.js'
import { createInteractiveShellTool } from './ask/index.js'
import { MAX_PTY_SESSIONS } from './pty/index.js'
import type { SessionPtyOwner } from './pty/index.js'
import { ToolRegistry, resolveToolScope } from './tools/index.js'
import { declareAgent, toolsNamed } from './composition/agent-spec.js'
import { settingSourcesFor } from './setting-sources.js'



/** B-055 — told when a PreToolUse hook blocks a tool call, so a surface can render it. */
export type HookVetoListener = (veto: { tool: string; reason: string }) => void

export function buildChatAgent(overrides: {
  onHookVeto?: HookVetoListener
  /**
   * B-069/B-070/B-071 — told what this build actually wired, once, at the point it was decided.
   *
   * Same shape as `onHookVeto`: a surface that wants to SHOW the wiring passes a listener, and the
   * return type stays an agent. The alternative — a surface re-reading config to describe the
   * agent — is what B-071 was reopened for, because config and reality can disagree and the
   * disagreement is the bug worth catching.
   */
  onWired?: (wired: WiredCapabilities) => void
  /**
   * M82 — where `loadMcpJson`'s warnings go.
   *
   * Same shape as `onHookVeto` and `onWired`, and here for the same reason: the surface that SHOWS
   * MCP state supplies the channel, and this layer stays free of it. The alternative would be
   * importing the TUI's holder from `packages/agent`, inverting the dependency.
   *
   * Omitting it is not neutral. The framework's `loadMcpJson` documents that without `onWarn` the
   * warnings go to `stderr` — never nowhere, but never to the user either. Under the TUI, stderr is
   * a log file nobody has open, so "server X was ignored: unknown field" was invisible while `/mcp`
   * cheerfully listed the servers that DID load. A user reading that panel had no way to learn one
   * was missing.
   */
  onMcpWarn?: (warning: string) => void
  extraTools?: readonly CustomTool[]
  appendInstructions?: string
  baseInstructions?: string
  surface?: 'interactive' | 'headless'
  /**
   * B-015 — the project directory, read ONCE. It used to be `process.cwd()` at six independent
   * points (trust posture, effective config, tool scope, project instructions, approved hooks, MCP
   * manifest), while the CLI composition root resolved a directory and injected `config`/`posture`
   * built from it — so a supplied directory governed two reads and was ignored by four. Nothing made
   * the six agree; they agreed because the current callers happen not to change cwd mid-build.
   *
   * B-059 — now REQUIRED. B-015 and B-032 closed the read sites but left the parameter optional,
   * which kept the ambient default reachable: a caller that simply forgot got a silently different
   * agent, and the defect could reappear without anyone editing this file. Requiring it moves the
   * guarantee from "every caller remembers" to "the compiler refuses" — the same move B-006 made
   * for `ToolScope.sandbox`. Every surface already resolves a directory (the CLI at its composition
   * root, the TUI through `workingDirectory()`), so nothing had to invent one; the single entry
   * with none to offer, the ACP one, now names the process directory out loud at the point where
   * that IS the choice rather than a default buried six frames deep.
   */
  cwd: string
  reasoning_effort?: ReasoningEffort
  posture?: TrustPosture
  config?: EffectiveConfig
  model?: string
  interactiveBackend?: InteractiveBackend
  sessionPty?: SessionPtyOwner
}) {
  const { posture, cfg, writePolicy, registry, modelId, cwd } = chatContext(overrides)

  const interactiveBackend = resolveInteractiveBackend(overrides, cfg)
  // B-055 — a surface that wants to SHOW a veto passes a listener. The signal leaves at the veto
  // site because on the wire a blocked call is indistinguishable from a successful one, by the
  // SDK's design (see `buildHookHandlers`).
  const lifecycleHooks = chatHookChain(cfg, posture, cwd, overrides?.onHookVeto)
  const providerPlugins = resolveProviderPlugins(overrides?.model, modelId)
  // Decided ONCE, here, for the same reason `mcpServers` is: the tool and its approval entry are
  // written by two different functions, and the framework refuses a map naming a tool it was not
  // given — so two reads that disagreed would crash the user's terminal at construction.
  const searchConfigured = webSearchConfigured()
  const baseCtx = { cfg, modelId, posture, providerPlugins, registry, overrides, cwd }
  const base = baseAgent({ ...baseCtx, searchConfigured })

  const withWrites = withWriteTools(base, {
    writePolicy,
    registry,
    modelId,
    cfg,
    posture,
    lifecycleHooks,
    cwd,
    reasoning_effort: overrides?.reasoning_effort,
  })

  // B-069/B-070/B-071 — loaded ONCE, here, and handed to both the builder and the record. It used
  // to be loaded inside the chain, where the result was passed to `.mcp()` and then unreachable —
  // which is why every listing that wanted it had to re-read the file and could disagree with what
  // actually ran.
  const mcp = mcpScopes(posture, cwd, overrides?.onMcpWarn)

  const chain = withShellAndProjectEntities(withWrites, {
    registry,
    interactiveBackend,
    posture,
    cfg,
    lifecycleHooks,
    modelId,
    writePolicy,
    cwd,
    mcpServers: mcp.servers,
    searchConfigured,
  })

  // Derived from the SAME values the builder just received, at the point it received them. That is
  // the DoD bullet B-071 was reopened for: not a second read of config, but a record of the
  // decision.
  const wired = wiringRecord(posture, cwd, cfg, mcp)

  overrides?.onWired?.(wired)

  const profileScopedTools = profileTools(overrides?.surface, ask, abandonQuestion)
  const allTools = [...profileScopedTools, ...(overrides?.extraTools ?? [])]
  return allTools.reduce((acc, tool) => acc.tool(tool), chain).build()
}

/**
 * B-071 — the hook EVENTS this config declares, for the wired record.
 *
 * Reads the already-resolved `cfg` object, not the file: `chatHookChain` parses the same value to
 * build the handlers, so the two cannot describe different hooks. A malformed block yields an empty
 * list here and is surfaced by the consent gate, which already reports it (B-039) — this record is
 * not the place to raise it a second time.
 */

function chatContext(overrides: {
  posture?: TrustPosture
  config?: EffectiveConfig
  model?: string
  cwd: string
}) {
  const cwd = overrides.cwd
  const posture = overrides?.posture ?? resolveTrustPosture(cwd)
  const resolved = overrides?.config ?? resolveEffectiveConfig({ cwd })
  // B-076 — the session may have overridden the sandbox mode. Applied HERE, once, so every consumer
  // in this build (write policy, PTY backend, tool scope, the reported label) sees one value —
  // previously the mode was read from `cfg` at four points, which is how B-014 happened.
  const cfg = withSandboxMode(resolved, sandboxModeForSession(resolved.sandbox_mode))
  return {
    posture,
    cfg,
    writePolicy: sandboxWritePolicy(cfg.sandbox_mode),
    registry: new ToolRegistry(resolveToolScope(cfg, cwd)),
    modelId: overrides?.model ?? cfg.model,
    cwd,
  }
}

function resolveInteractiveBackend(
  overrides: { sessionPty?: SessionPtyOwner; interactiveBackend?: InteractiveBackend } | undefined,
  cfg: EffectiveConfig,
): InteractiveBackend {
  overrides?.sessionPty?.setMode(cfg.sandbox_mode)
  return (
    overrides?.sessionPty?.backend() ??
    overrides?.interactiveBackend ??
    new PtyInteractiveBackend({
      wrapCommand: interactiveWrapCommand({ mode: cfg.sandbox_mode }),
      maxSessions: MAX_PTY_SESSIONS,
    })
  )
}

/**
 * The instruction document, in precedence order: the operator's, then the repository's.
 *
 * The USER layer is outside the trust gate on purpose (#65). That gate is the defence against a
 * repository hijacking the agent through instructions, and it answers "do I trust the code in this
 * directory?" — a question about `~/.theocode/AGENTS.md` that has no meaning, since nobody's home
 * directory is the directory in question. `settingSourcesFor` already keeps `user: true` through an
 * untrusted cwd for exactly this reason.
 *
 * Project LAST, so it wins: the two are concatenated, and the closer instruction is the one the
 * model reads last. Same order the config layers already resolve in, and the same one the README
 * states for them.
 */
function projectDocument(posture: TrustPosture, cwd: string): string {
  const home = homedir()
  const user = [loadUserAgentsMd(home), loadUserRules(home).text].filter(Boolean).join('\n\n')
  if (!posture.allows.agentsMd) return user
  return [user, loadAgentsMd(cwd), loadRules(cwd).text].filter(Boolean).join('\n\n')
}

function resolveProviderPlugins(
  requestedModel: string | undefined,
  modelId: string,
): ReturnType<typeof Provider.builtins> {
  if (requestedModel === undefined) return []
  const plugin = Provider.forModel(modelId)
  if (plugin === undefined) {
    throw new ConfigurationError(
      `--model ${modelId}: no builtin provider serves this id. ` +
        `Use the provider/model form (e.g. anthropic/claude-sonnet-4-5). ` +
        `Available: ${Provider.builtins()
          .map((p) => p.name)
          .join(', ')}`,
    )
  }
  return [plugin]
}

function chatHookChain(
  cfg: EffectiveConfig,
  posture: TrustPosture,
  cwd: string,
  onVeto?: HookVetoListener,
) {
  return withBuiltinShellVeto(
    buildHookHandlers(parseHooks(cfg.hooks), {
      trusted: posture.allows.hooks,
      approved: new Set([...loadApprovedHooks(cwd).keys()]),
      ...(onVeto === undefined ? {} : { onVeto }),
    }),
  )
}

function withWriteTools<T extends { tool: (t: CustomTool) => T }>(
  base: T,
  ctx: {
    writePolicy: ReturnType<typeof sandboxWritePolicy>
    registry: ToolRegistry
    modelId: string
    cfg: EffectiveConfig
    posture: TrustPosture
    lifecycleHooks: ReturnType<typeof chatHookChain>
    /** B-032 — threaded through so the delegated team is confined to the same tree as the root. */
    cwd: string
    reasoning_effort?: ReasoningEffort
  },
): T {
  const { writePolicy, registry, modelId, cfg, posture, lifecycleHooks, cwd } = ctx
  const overrides = { reasoning_effort: ctx.reasoning_effort }
  return writePolicy.writes
    ? base
        .tool(registry.get('apply_patch'))
        .tool(registry.get('edit_file'))
        // M36 — a SEQUENTIAL team (explorer → worker) built from the SDK's `Squad.create` (no bespoke
        // orchestration — Rule 9). Write-gated with the other write tools: the worker member needs write
        // authority, so gating here keeps a team from widening a member's authority beyond the parent's
        // current sandbox posture (read-only ⇒ no team; the read-only `analyst` delegation remains).
        // M70 — the team receives what the ROOT resolved (including the runtime `--model` and
        // `/effort`), instead of the handler re-reading config from disk and delegating with whatever
        // was written there.
        .tool(
          createDelegateToTeamTool({
            model: modelId,
            reasoning_effort: overrides?.reasoning_effort ?? cfg.reasoning_effort,
            sandbox_mode: cfg.sandbox_mode,
            posture,
            // B-032 — the same directory every other resolution in this builder uses.
            cwd,
            hooks: lifecycleHooks,
          }),
        )
    : base
}

function withShellAndProjectEntities(
  withWrites: ReturnType<typeof withWriteTools<ReturnType<typeof baseAgent>>>,
  ctx: {
    registry: ToolRegistry
    interactiveBackend: InteractiveBackend
    posture: TrustPosture
    cfg: EffectiveConfig
    lifecycleHooks: ReturnType<typeof chatHookChain>
    modelId: string
    writePolicy: ReturnType<typeof sandboxWritePolicy>
    cwd: string
    /** B-069 — loaded by the caller so the record and the builder cannot disagree. */
    mcpServers: ReturnType<typeof loadMcpJson>
    /**
     * Decided by the caller, for the same reason: this function writes the `web_search` APPROVAL
     * entry while `baseAgent` registers the tool, and the framework refuses a map naming a tool the
     * agent does not hold.
     */
    searchConfigured: boolean
  },
) {
  const { registry, interactiveBackend, posture, cfg, lifecycleHooks, modelId, writePolicy } = ctx
  return (
    withWrites
      // M2 — the write side: atomic multi-file edits, gated behind approval below. M18: now the Codex-faithful
      // V4A `createApplyPatchTool` built-in (`*** Begin Patch` grammar, context-tolerant matcher, strict
      // atomic apply). Retired the bespoke JSON apply-patch.ts + apply-patch-core.ts.
      // M13 — single-string edit as a BUILT-IN consumed straight from `@theokit/agents/tools`, aliased to a
      // Codex name via the `withName` mechanism we upstreamed. It carries the context-tolerant matcher we
      // also upstreamed (edit_file Strategy 3). Full circle: theocode reuses the ecosystem it enriched.
      // M3 — shell execution, gated behind approval below. M16: now the surface-agnostic `createShellTool`
      // built-in (catastrophic-command guard + optional SandboxProvider injection), aliased back to the
      // Codex-ish `run_shell` name so the approval gate + TUI header/render + tool contract are unchanged.
      // The description is overridden to this agent's actual tool set (the built-in's default names
      // write_file/glob_files/search_text — which we don't register — and drops the interactive_shell steer).
      // M68 — `run_shell`'s AUTHORITY (projectRoot + kernel sandbox) comes from the single registry;
      // what stays here is the parent's own STEER. The distinction is deliberate: the description
      // cites `interactive_shell`/`write_stdin`, which a squad member does NOT receive, so inheriting
      // it would point them at tools they do not have. The registry rules what a tool CAN do; the
      // consumer may refine what it SAYS to the model.
      .tool(
        withDescription(
          registry.get('run_shell'),
          'Run a shell command in the project (tests, build, git). Returns { ok, stdout, stderr, exit_code } ' +
            '— READ exit_code, non-zero means it failed; report what failed, never claim success unless 0. ' +
            'One-shot and non-interactive (no stdin): for a REPL or a command that PROMPTS for input ' +
            '(python3, git rebase -i, a read prompt) use interactive_shell + write_stdin instead. Do NOT use ' +
            'it for file ops — prefer read_file/list_dir/grep/apply_patch. timeout_ms defaults to 30000 ' +
            '(max 300000). Requires human approval before running.',
        ),
      )
      // M14 — interactive session as a surface-agnostic built-in from @theokit/agents/tools, backed by the
      // injected @theokit/agents-pty (local node-pty). `interactive_shell` starts a REPL/prompting session;
      // `write_stdin` drives it. Both gated below. Replaces the bespoke run_shell-interactive + write_stdin.
      // M101 #188 — OUR `interactive_shell`: the SDK's collapses `MaxSessionsError` into
      // `{"ok":false,"error":"interactive_unavailable"}`, so `max`/`liveSessionIds` — the only
      // information the model can act on — never reach it. See
      // `agents/ask/interactive-shell-tool.ts` (which carries the mechanised exit criterion).
      .tool(createInteractiveShellTool({ interactive: interactiveBackend }))
      .tool(createWriteStdinTool({ interactive: interactiveBackend }))
      // M4 — the visible plan/step affordance for the iterate-to-green loop (no side effect, not gated).
      // M17: now the Codex-faithful `createUpdatePlanTool` built-in (declarative plan; structured result
      // rendered as a □/▶/✔ checklist by the TUI's formatToolResult). Retired the bespoke local tool.
      .tool(createUpdatePlanTool())
      // A2A — delegate focused, read-only analysis to an isolated child agent. `SubAgent.create` returns a
      // `CustomTool`, so it wires through the same `.tool()` seam. Needs `@theokit/agents@>=7.3.1` (#142+#143).
      .tool(createAnalystSubagent(modelId, registry))
      // Human-in-the-loop: gate every side-effecting / disk-mutating / command-executing tool behind an
      // approval. The run pauses and the surface shows an approval card — allow or reject — before it runs.
      // M23 — the approval map must reference ONLY registered tools (the framework fail-fasts otherwise),
      // so the write-tool gates appear exactly when the sandbox mode granted those tools.
      .approvals({
        ...(writePolicy.writes
          ? {
              apply_patch: { question: 'Apply this file patch?' },
              edit_file: { question: 'Apply this edit?' },
              delegate_to_team: {
                question: 'Delegate this task to the team (the worker may edit/run files)?',
              },
            }
          : {}),
        run_shell: { question: 'Run this shell command?' },
        interactive_shell: { question: 'Start this interactive session?' },
        write_stdin: { question: 'Send this input to the interactive session?' },
        web_fetch: { question: 'Fetch this URL?' },
        // Present only when the tool is. An approval entry for a tool the agent was not given is
        // refused by the framework at construction, so this ternary is load-bearing, not cosmetic.
        ...(ctx.searchConfigured ? { web_search: { question: 'Search the web for this?' } } : {}),
      })
      // M8 — MCP tools (Codex parity): wire external Model Context Protocol servers declared in the
      // project's `.mcp.json`. The SDK owns MCP execution (spawn + tools/list + tools/call); their tools
      // appear alongside the built-in ones. Absent `.mcp.json` ⇒ empty map ⇒ no-op (MCP is opt-in).
      // M33 — TRUST-GATED (closing the M33 review's F1): `.mcp.json` is repo-tracked and the SDK SPAWNS its
      // servers as external processes at agent init, BEFORE any per-tool approval. An untrusted repo could
      // therefore get arbitrary local command execution on first build. MCP was the one disk entity left
      // ungated while skills/AGENTS.md/subagents are gated; untrusted ⇒ no MCP servers, same posture.
      .mcp(ctx.mcpServers)
      // M24 — skills are DISK-loaded: `.skills([...names])` resolves each name from
      // `.theokit/skills/<name>/SKILL.md` (theokit's filebase, enabled by `.settingSources` in M20). The
      // enabled list comes from config (`skills`, Codex parity). TRUST-GATED like AGENTS.md: an untrusted
      // repo's SKILL.md must not steer the agent (anti-prompt-injection), so untrusted ⇒ no skills.
      .skills(posture.allows.skills ? [...cfg.skills] : [])
      // M20 — opt into theokit's `.theokit/` file-based config (project + user): skills, subagents, hooks,
      // context, mcp are discovered from disk. The enabler for M24 (disk skills), M25 (subagent roles), M26
      // (lifecycle hooks) — those milestones populate `.theokit/`; here we just turn discovery on. The
      // hand-rolled AGENTS.md + `.mcp.json` loaders stay for back-compat (Codex `.codex` + AGENTS.md parity).
      // M33 — TRUST-GATE the `project` source. The SDK loads `.theokit/agents/*.md` (and now honors their
      // per-agent `model`/`reasoning_effort`/`sandbox`) whenever `project` is enabled, and the loader runs
      // inside the SDK before theocode sees the roles — so the ONLY seam we control to stop an untrusted
      // repo from redirecting a subagent's model/sandbox is this toggle. Untrusted ⇒ `user` only, mirroring
      // how `.skills()` and AGENTS.md are already gated (subagents were the one disk entity that was not).
      // B-008 — the `project` source enables repository hooks too, not just subagent discovery, and
      // those bypass TheoCode's per-hook fingerprint gate. It now requires both capabilities.
      // M86 — `@theokit/agents@8.0.0` asks for the evidence instead of a string list. `user` stays a
      // boolean (`~/.theokit/` is the operator's own machine); `project` now carries the posture that
      // authorized it, so a refusal inside the framework can say WHERE the decision came from. The
      // gate itself is unchanged — `projectSettingsPosture` projects the same B-008 conjunction.
      //
      // `project` is OMITTED rather than passed with a denying posture. The framework REFUSES a
      // requested-but-ungranted `project` by throwing — right for a caller that asked for it, and
      // TheoCode is not asking. An untrusted directory here has always degraded to user-only and
      // kept working; passing the grant unconditionally would turn that into a hard failure on every
      // untrusted repo. Omitting a root is not enabling it.
      .settingSources(settingSourcesFor(posture))
      .hooks(lifecycleHooks)
  )

  // M70 — the two registrations that depend on the surface PROFILE, applied here because the builder
  // is a fluent chain with no `.tools([...])`: there is no way to skip a link in the middle of it.
  //
  // `request_user_input` is dropped for the headless profile (m70-goal-convergence#ADR-4): with no TUI
  // subscribed, `ask()` never resolves and the tool falls into the built-in's 5-minute timeout.
  // `extraTools` is the seam that was missing — it is how goal mode registers `update_goal` instead of
  // building a second agent from scratch.
  // M76 — the framework's own tool, built straight from the factory. It used to be a 20-line ADAPTER with
  // two casts, because `createQuestionTool` returned its own interface and took no name. T1.1 aligned the
  // type, T1.2 made name and description options, and the adapter stopped existing — it did not shrink,
  // it vanished. `askUser` remains the fallback; the preferred asker comes from the context.
}

/**
 * B-059 — the coding agent's registry-backed tool set, declared through the shared entry.
 *
 * Memoised per registry because the chain asks for one tool at a time and the shape is one
 * decision; rebuilding it per `.tool()` call would make the provenance record say the set was
 * declared six times.
 */
const READ_TOOLS = [
  'current_time',
  'read_file',
  'view_image',
  'list_dir',
  'grep',
  'repo_status',
  'git_diff',
] as const
const shapeCache = new WeakMap<ToolRegistry, Map<string, CustomTool>>()

function readTool(registry: ToolRegistry, name: (typeof READ_TOOLS)[number]): CustomTool {
  let byName = shapeCache.get(registry)
  if (byName === undefined) {
    const shape = declareAgent(
      'coding-agent-reads',
      { registry, model: 'unused', reasoning_effort: 'medium' },
      [toolsNamed(registry, READ_TOOLS)],
    )
    byName = new Map(shape.tools.map((tool) => [tool.name, tool]))
    shapeCache.set(registry, byName)
  }
  const tool = byName.get(name)
  if (tool === undefined) {
    throw new ConfigurationError(`"${name}" is not in the declared coding-agent read set`, {
      code: 'tool_not_declared',
    })
  }
  return tool
}

function baseAgent(ctx: {
  cfg: EffectiveConfig
  modelId: string
  posture: TrustPosture
  cwd: string
  providerPlugins: ReturnType<typeof Provider.builtins>
  registry: ToolRegistry
  /** See `webSearchConfigured`. Decided by the caller so the tool and its approval agree. */
  searchConfigured: boolean
  overrides?: {
    baseInstructions?: string
    appendInstructions?: string
    reasoning_effort?: ReasoningEffort
  }
}) {
  const { cfg, modelId, posture, providerPlugins, registry, overrides } = ctx
  return (
    AgentBuilder.create()
      .input(z.object({ message: z.string() }))
      // M94 — the window declared in config reaches all the way to the compaction budget. Without it, a
      // 400k model with no catalogue entry (the OpenRouter case) was budgeted against the 128k floor and
      // compacted ~3x more than it needed to.
      // M98 — the input now has ONE named path (`declaredWindow`), and that is what is handed to the
      // runtime, RAW. Measured: the SDK stores this number and applies the margin internally, so passing
      // the projection (`contextWindow.window`, margin already applied) would apply the margin twice.
      // This is the only production consumer of the input, and one gate counts.
      .model(
        cfg.declaredWindow !== undefined
          ? { id: modelId, contextWindow: cfg.declaredWindow }
          : modelId,
      )
      // M96 T5.4 — the headless profile no longer installs a local veto.
      //
      // The block that lived here was compensation: `toAgentFactory` discarded the declared HITL gate, and
      // the consumer re-imposed the policy with a `beforeToolCall` over a copy of the gated tool list —
      // framework knowledge duplicated in the app, with a test watching the two lists for divergence.
      // Since `@theokit/agents@5.0.0` the approval posture is a MANDATORY bridge parameter, so enforcement
      // went back to its owner and the duplicate is gone.
      //
      // The DECISION remains the product's: each headless surface declares its posture at the composition
      // point (`exec/main.ts`), derived from `headlessApprovalPosture` — including the F-arch-3 refusal
      // ("no bwrap means no confinement") that M70 added.
      .plugins([...providerPlugins])
      // M20 — reasoning budget from config (default "medium" matches Codex's own default, so the harness
      // comparison still isolates harness behavior when no config overrides it).
      .reasoningEffort(overrides?.reasoning_effort ?? cfg.reasoning_effort)
      // M5 — fold any project AGENTS.md (root→cwd) into the persona so per-project rules are honored, but
      // ONLY for a TRUSTED directory (anti-prompt-injection, Codex parity): an untrusted repo's AGENTS.md is
      // NOT loaded, so it cannot hijack the agent. The TUI prompts to trust the cwd on first run.
      .system(
        composeInstructions(
          overrides?.baseInstructions ?? BASE_INSTRUCTIONS,
          projectDocument(ctx.posture, ctx.cwd),
          overrides?.appendInstructions ?? '',
          { maxChars: MAX_AGGREGATE, warn: (m: string) => process.stderr.write(`${m}\n`) },
        ),
      )
      // M49 — durable memory (`.theokit/memory/` in the cwd: `Remember:` capture with secret redaction,
      // auto-injected recall, memory_search/memory_get). interactive-sandbox#ADR-2: the store WRITES to the cwd, so memory is
      // enabled only for a TRUSTED directory — same gate as AGENTS.md/skills. `{enabled:false}` and an
      // omitted field are equivalent to the SDK gate (`enabled !== true`); the explicit false makes the
      // decision observable in the compiled definition.
      // B-077 — trust decides whether memory is POSSIBLE; the session switch can only restrict it
      // further. ANDed rather than overridden, so `/memory off` cannot be read as permission and a
      // session cannot re-enable what an untrusted directory forbids.
      // Three gates, ANDed, each answering a different question:
      //   posture.allows.memory     — may this directory have memory at all (the store writes into
      //                               the cwd, so an untrusted repository must not get one);
      //   cfg.memory                — did anyone ASK for it. Off by default, matching Codex, whose
      //                               equivalent ships as a feature with `default_enabled: false`;
      //   memoryEnabledForSession() — `/memory off`, which can only ever RESTRICT further.
      //
      // ANDed rather than overridden so neither the config nor the session reads as permission: an
      // untrusted directory still forbids it, and `/memory on` cannot re-enable what config declined.
      //
      // `cfg.memory === true` rather than `cfg.memory`: `&&` yields the first falsy OPERAND, so a
      // config object without the key made the whole expression `undefined` — which reads as "off"
      // to the SDK and as a type error to nobody, because the field is optional upstream. It cost a
      // test that asserted `false` and got `undefined`.
      .memory({
        enabled: posture.allows.memory && cfg.memory === true && memoryEnabledForSession(),
      })
      // B-059 — WHICH registry tools this agent holds is decided by the shared composition entry
      // (`composition/agent-spec.ts`), the same one the reviewer and the delegated roles go
      // through. The fluent chain is untouched: the entry returns a SHAPE and the tools are fed in
      // here, so this is a declaration change and not a behaviour change. The per-tool comments
      // below record why each is in the set and stay with the declaration.
      //
      // M16 — current_time is now a surface-agnostic built-in consumed from `@theokit/agents/tools`
      // (Codex-faithful UTC + optional IANA timezone); the bespoke local tool was retired.
      .tool(readTool(registry, 'current_time'))
      // M1 — read-only filesystem access (path-safe; see tools/*.ts + lib/*-core.ts).
      // M17: read_file is now the Codex-grade `createReadFileTool` built-in — lineNumbers (cat -n view the
      // model cites/edits by), offset/limit paging, and allowAbsolute (Codex reads-anywhere; the secret guard
      // blocks .env/.git/… at any depth). Retired the bespoke read-file.ts + read-file-core.ts.
      .tool(readTool(registry, 'read_file'))
      // B-082 registered `view_image` and never handed it to an agent. Measured 2026-08-25: the
      // registry built it, `image-root.test.ts` asserted it was resolvable BY THE REGISTRY under a
      // describe block named "view_image is wired", and no agent held it — the compiled chat agent
      // declared 16 tools and this was not among them. So the model could not look at a screenshot
      // it had just produced, which is the entire capability the item exists for, and the test
      // that would have caught it was checking the wrong end of the wire.
      //
      // Ungated, like every other read. It reads a file under the SAME root through the SAME
      // containment rule as `read_file`, which is ungated; `read_file` can already hand the model
      // the bytes of any file in the workspace. Gating this one would gate the RENDERING, not the
      // ACCESS, and would train the user to click through cards that protect nothing — which is
      // what makes the cards on `run_shell` and `apply_patch` worth reading.
      .tool(readTool(registry, 'view_image'))
      .tool(readTool(registry, 'list_dir'))
      // M17: grep is now the `createSearchTextTool` built-in in regex mode (grep semantics) + allowAbsolute
      // (Codex reads-anywhere), aliased to the `grep` name. Retired the bespoke grep.ts + grep-core.ts.
      .tool(readTool(registry, 'grep'))
      // M6 — repo-aware context (read-only, ungated).
      // M76 — the framework's tool. The local one parsed `git status --porcelain=v1 -b` in 62 LoC;
      // `createGitStatusTool` produces the SAME output, branch line included (parity verified BEFORE
      // deleting — without that check, migrating would have silently cost the "am I on the right branch?").
      // M99 — it comes from the registry. Built inline here until then, carrying `projectRoot` outside the
      // single source: one of the two sites the manual survey at `ROADMAP.md:2412` did not enumerate, in
      // the very file M68 refactored. The name (`repo_status`) is preserved — it is a contract with the
      // model, with the approval map, and with the TUI's rendering.
      .tool(readTool(registry, 'repo_status'))
      // M38 — the working-tree diff, so the model can review pending changes. `createGitDiffTool` is a
      // `@theokit/agents/tools` built-in (`git diff --no-color`, detached, 30s/5MB caps) — read-only, so ungated
      // (same posture as `repo_status`, which also shells out to git). LLM name: `git_diff`.
      // M99 — same as above: from the registry, keeping the name `git_diff`.
      .tool(readTool(registry, 'git_diff'))
      // M38 — `request_user_input`: the agent pauses mid-turn to ask the user a question, resolved through the
      // TUI's EXISTING inline input slot via the ask-bridge (no second prompt channel). `createQuestionTool`
      // returns a literal object named `question` with an `unknown` inputSchema, so we spread-adapt it to the
      // Codex-faithful name + the `CustomTool` shape, REUSING its handler + 5-min timeout (Rule 9). Ungated:
      // its only effect is to ask the human, so a boolean approval card on top would be a redundant gate.
      // M34 — web tools (Codex `web_search` parity), both approval-gated below. `web_fetch` needs no key and
      // keeps the built-in's SSRF guard ON by default (a model-chosen URL is untrusted). `web_search` uses the
      // GENERIC HTTP adapter, which degrades to `[]` when no provider (`THEOKIT_SEARCH_API_URL`/`_KEY`) is set
      // — so the agent builds and runs with or without a search provider (Brave would throw `no_api_key` at
      // creation). Both are `@theokit/agents/tools` built-ins — wired, not reinvented (Rule 9).
      .tool(createWebFetchTool())
      // `web_search` is declared ONLY when a provider is configured — see `webSearchConfigured`.
      // `.when` (M69) is the seam for exactly this: a conditional link in the MIDDLE of a fluent
      // chain, which is what `chat.ts:320` records as impossible without it.
      .when(ctx.searchConfigured, (b) =>
        b.tool(createWebSearchTool({ search: createGenericHttpSearchAdapter() })),
      )
  )

  // M23 — write tools exist ONLY when the sandbox mode grants writes (Codex `read-only` removes the
  // capability instead of denying it later). `workspace-write` confines them to the project root;
  // `danger-full-access` lifts the root to `/`.
}

function profileTools(
  declaredSurface: 'interactive' | 'headless' | undefined,
  ask: Parameters<typeof createQuestionTool>[0]['askUser'],
  abandonQuestion: () => void,
): CustomTool[] {
  const askTheUser = (): CustomTool[] => [
    createQuestionTool({
      askUser: ask,
      onAbandon: abandonQuestion,
      name: 'request_user_input',
      description:
        'Ask the user a clarifying question and pause until they answer. Use when the task is ' +
        'ambiguous and a single answer would unblock you — prefer this over guessing. ' +
        'Input: { question }.',
    }),
  ]

  const surface = declaredSurface ?? 'interactive'
  switch (surface) {
    case 'headless':
      return []
    case 'interactive':
      return askTheUser()
    default: {
      const unhandled: never = surface
      throw new ConfigurationError(`unhandled surface: ${String(unhandled)}`, {
        code: 'surface_unhandled',
      })
    }
  }
}



/**
 * Whether a web-search PROVIDER is actually reachable — and therefore whether `web_search` is
 * declared to the model at all.
 *
 * `createGenericHttpSearchAdapter` documents that it "degrades gracefully: when unconfigured OR on
 * any network/parse failure it returns `[]` and never throws". Graceful for the RUN, and wrong for
 * the PROMPT. With no provider configured — the default for anyone who has not set
 * `THEOKIT_SEARCH_API_URL` — the tool was still declared on every round, measured at 761 characters
 * of schema against a total tool surface of 12 857, was approval-gated, and could return only `[]`.
 * So the model paid for a capability it did not have, could spend a whole round discovering the
 * emptiness, and the user was shown an approval card for a search that had nothing to search.
 *
 * That is the same defect shape as the runtime builtin `shell` (`hooks/veto-builtin-shell.ts`):
 * advertise a tool that cannot work, then deal with the consequences at call time. The difference
 * is that this one is OURS to withhold — the SDK injects `shell` with no opt-out — so it is
 * withheld at composition time instead of explained away afterwards.
 *
 * Only the URL is checked, deliberately. The adapter treats the key as optional, because an
 * endpoint that needs no auth is legitimate; demanding a key here would withhold a tool that would
 * have worked. The endpoint is the one value without which the adapter cannot even try.
 */
function webSearchConfigured(): boolean {
  return (process.env['THEOKIT_SEARCH_API_URL'] ?? '').trim() !== ''
}
