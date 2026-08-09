import { AgentBuilder, ConfigurationError, loadMcpJson } from '@theokit/agents'
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

import { PtyInteractiveBackend } from '@theokit/agents/pty'
import { z } from 'zod'

import { MAX_AGGREGATE, composeInstructions, loadAgentsMd } from './context/index.js'
import { loadRules } from './context/index.js'
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
import { projectSourceAllowed } from './config/project-source.js'

/** B-055 — told when a PreToolUse hook blocks a tool call, so a surface can render it. */
export type HookVetoListener = (veto: { tool: string; reason: string }) => void

export function buildChatAgent(overrides?: {
  onHookVeto?: HookVetoListener
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
   */
  cwd?: string
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
  const providerPlugins = pluginsDoProvider(overrides?.model, modelId)
  const base = baseAgent({ cfg, modelId, posture, providerPlugins, registry, overrides, cwd })

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

  const chain = withShellAndProjectEntities(withWrites, {
    registry,
    interactiveBackend,
    posture,
    cfg,
    lifecycleHooks,
    modelId,
    writePolicy,
    cwd,
  })

  const profileScopedTools = profileTools(overrides?.surface, ask, abandonQuestion)
  const allTools = [...profileScopedTools, ...(overrides?.extraTools ?? [])]
  return allTools.reduce((acc, tool) => acc.tool(tool), chain).build()
}

function chatContext(overrides?: {
  posture?: TrustPosture
  config?: EffectiveConfig
  model?: string
  cwd?: string
}) {
  const cwd = overrides?.cwd ?? process.cwd()
  const posture = overrides?.posture ?? resolveTrustPosture(cwd)
  const cfg = overrides?.config ?? resolveEffectiveConfig({ cwd })
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

function projectDocument(posture: TrustPosture, cwd: string): string {
  if (!posture.allows.agentsMd) return ''
  return [loadAgentsMd(cwd), loadRules(cwd).text].filter(Boolean).join('\n\n')
}

function pluginsDoProvider(
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
      // injected @theokit/agents/pty (local node-pty). `interactive_shell` starts a REPL/prompting session;
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
        web_search: { question: 'Search the web for this?' },
      })
      // M8 — MCP tools (Codex parity): wire external Model Context Protocol servers declared in the
      // project's `.mcp.json`. The SDK owns MCP execution (spawn + tools/list + tools/call); their tools
      // appear alongside the built-in ones. Absent `.mcp.json` ⇒ empty map ⇒ no-op (MCP is opt-in).
      // M33 — TRUST-GATED (closing the M33 review's F1): `.mcp.json` is repo-tracked and the SDK SPAWNS its
      // servers as external processes at agent init, BEFORE any per-tool approval. An untrusted repo could
      // therefore get arbitrary local command execution on first build. MCP was the one disk entity left
      // ungated while skills/AGENTS.md/subagents are gated; untrusted ⇒ no MCP servers, same posture.
      .mcp(posture.allows.mcp ? loadMcpJson(ctx.cwd) : {})
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
      .settingSources(projectSourceAllowed(posture.allows) ? ['project', 'user'] : ['user'])
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

function baseAgent(ctx: {
  cfg: EffectiveConfig
  modelId: string
  posture: TrustPosture
  cwd: string
  providerPlugins: ReturnType<typeof Provider.builtins>
  registry: ToolRegistry
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
      // M20 — reasoning budget from config (default "medium" matches Codex's gpt-5.4 default, so the harness
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
      .memory({ enabled: posture.allows.memory })
      // M16 — current_time is now a surface-agnostic built-in consumed from `@theokit/agents/tools`
      // (Codex-faithful UTC + optional IANA timezone); the bespoke local tool was retired.
      .tool(registry.get('current_time'))
      // M1 — read-only filesystem access (path-safe; see tools/*.ts + lib/*-core.ts).
      // M17: read_file is now the Codex-grade `createReadFileTool` built-in — lineNumbers (cat -n view the
      // model cites/edits by), offset/limit paging, and allowAbsolute (Codex reads-anywhere; the secret guard
      // blocks .env/.git/… at any depth). Retired the bespoke read-file.ts + read-file-core.ts.
      .tool(registry.get('read_file'))
      .tool(registry.get('list_dir'))
      // M17: grep is now the `createSearchTextTool` built-in in regex mode (grep semantics) + allowAbsolute
      // (Codex reads-anywhere), aliased to the `grep` name. Retired the bespoke grep.ts + grep-core.ts.
      .tool(registry.get('grep'))
      // M6 — repo-aware context (read-only, ungated).
      // M76 — the framework's tool. The local one parsed `git status --porcelain=v1 -b` in 62 LoC;
      // `createGitStatusTool` produces the SAME output, branch line included (parity verified BEFORE
      // deleting — without that check, migrating would have silently cost the "am I on the right branch?").
      // M99 — it comes from the registry. Built inline here until then, carrying `projectRoot` outside the
      // single source: one of the two sites the manual survey at `ROADMAP.md:2412` did not enumerate, in
      // the very file M68 refactored. The name (`repo_status`) is preserved — it is a contract with the
      // model, with the approval map, and with the TUI's rendering.
      .tool(registry.get('repo_status'))
      // M38 — the working-tree diff, so the model can review pending changes. `createGitDiffTool` is a
      // `@theokit/agents/tools` built-in (`git diff --no-color`, detached, 30s/5MB caps) — read-only, so ungated
      // (same posture as `repo_status`, which also shells out to git). LLM name: `git_diff`.
      // M99 — same as above: from the registry, keeping the name `git_diff`.
      .tool(registry.get('git_diff'))
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
      .tool(createWebSearchTool({ search: createGenericHttpSearchAdapter() }))
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
