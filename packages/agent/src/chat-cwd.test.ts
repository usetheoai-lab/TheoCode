/**
 * B-015 — the working directory is one fact, read once.
 *
 * `buildChatAgent` called `process.cwd()` at six independent points: the trust posture, the
 * effective config, the tool scope, the project instructions, the approved-hook set and the MCP
 * manifest. Meanwhile the CLI composition root resolves a directory and injects `config`/`posture`
 * built FROM it — so two of the four call sites supplied a directory and the function ignored it for
 * the other four reads.
 *
 * Nothing forces those six reads to agree. They agree today because `process.cwd()` happens not to
 * change mid-build, which is a property of the current callers rather than of this function.
 *
 * That is the same shape of defect as B-001: four composition sites, four different argument sets,
 * and a surface that silently got a profile nobody chose for it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveTrustPosture = vi.fn(() => ({
  level: 'trusted',
  allows: {
    projectConfig: true,
    agentsMd: true,
    hooks: true,
    memory: true,
    mcp: true,
    skills: true,
    subagents: true,
    customCommands: true,
  },
}))
const resolveEffectiveConfig = vi.fn(() => ({
  sandbox_mode: 'read-only',
  approval_policy: 'on-request',
  model: 'gpt-5.4',
  reasoning_effort: 'medium',
  hooks: [],
  skills: [],
  declaredWindow: undefined,
  contextWindow: { window: 1000 },
  sandboxPosture: { enforced: true, detail: 'test', mode: 'read-only' },
}))
const loadAgentsMd = vi.fn(() => '')
const loadRules = vi.fn(() => ({ text: '' }))
const loadApprovedHooks = vi.fn(() => new Map())
const createDelegateToTeamTool = vi.fn(() => ({ name: 'delegate_to_team' }))

vi.mock('./config/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveTrustPosture,
  resolveEffectiveConfig,
}))
vi.mock('./context/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadAgentsMd,
  loadRules,
}))
vi.mock('./delegation/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createDelegateToTeamTool,
}))
vi.mock('./hooks/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadApprovedHooks,
}))

const INJECTED = '/injected/project'

describe('B-015 — an injected working directory reaches every resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('test_the_trust_posture_is_resolved_for_the_injected_directory', async () => {
    const { buildChatAgent } = await import('./chat.js')

    buildChatAgent({ surface: 'headless', cwd: INJECTED })

    expect(
      resolveTrustPosture,
      'the trust posture was resolved for process.cwd() while the caller supplied a directory — ' +
        'the agent could be built with one directory trusted and another one configured',
    ).toHaveBeenCalledWith(INJECTED)
  })

  it('test_the_effective_config_is_resolved_for_the_injected_directory', async () => {
    const { buildChatAgent } = await import('./chat.js')

    buildChatAgent({ surface: 'headless', cwd: INJECTED })

    expect(resolveEffectiveConfig).toHaveBeenCalledWith(expect.objectContaining({ cwd: INJECTED }))
  })

  it('test_the_project_instructions_come_from_the_injected_directory', async () => {
    const { buildChatAgent } = await import('./chat.js')

    buildChatAgent({ surface: 'headless', cwd: INJECTED })

    expect(loadAgentsMd).toHaveBeenCalledWith(INJECTED)
  })

  it('test_omitting_the_directory_still_falls_back_to_the_process_one', async () => {
    // Anti-vacuity floor: every existing caller relies on the default, and three of the four do not
    // pass a directory at all.
    const { buildChatAgent } = await import('./chat.js')

    buildChatAgent({ surface: 'headless' })

    expect(resolveTrustPosture).toHaveBeenCalledWith(process.cwd())
  })
})

describe('B-032 — the injected directory reaches the delegated team', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveEffectiveConfig.mockReturnValue({
      sandbox_mode: 'workspace-write',
      approval_policy: 'on-request',
      model: 'gpt-5.4',
      reasoning_effort: 'medium',
      hooks: [],
      skills: [],
      declaredWindow: undefined,
      contextWindow: { window: 1000 },
      sandboxPosture: { enforced: true, detail: 'test', mode: 'workspace-write' },
    })
  })

  it('test_delegate_to_team_is_built_with_the_injected_directory', async () => {
    // `resolveToolScope` derives BOTH the writeRoot and the sandbox workDir from the directory it is
    // given, so a team built against `process.cwd()` confines its worker to the wrong tree. This is
    // the one B-015 bypass with a confinement consequence rather than a configuration one.
    const { buildChatAgent } = await import('./chat.js')

    buildChatAgent({ surface: 'headless', cwd: INJECTED })

    expect(
      createDelegateToTeamTool,
      'the delegated team was built without the injected directory, so its worker resolves its ' +
        'write root and sandbox from process.cwd()',
    ).toHaveBeenCalledWith(expect.objectContaining({ cwd: INJECTED }))
  })
})
