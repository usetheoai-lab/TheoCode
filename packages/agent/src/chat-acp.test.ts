/**
 * B-001 — the ACP surface must declare its own tool profile.
 *
 * `profileTools` (chat.ts) defaults to `'interactive'` when no surface is declared, and the
 * interactive profile registers `request_user_input` against the module-level `AskBridge`. Only the
 * TUI subscribes to that bridge (`tui/src/agent-session/ConversationSlot.tsx`), so on any other
 * surface `ask()` never resolves and the call stalls on the built-in's 5-minute timeout.
 *
 * `chat.ts` documents this hazard for the headless profile one screen above the default, and the ACP
 * entry hit the identical condition by omitting the argument entirely.
 *
 * The assertion is on the ARGUMENT the entry passes, not on the resulting tool list: the defect is
 * that the surface is left undeclared, and a test that inspected the tools would keep passing if
 * someone later changed the default instead of declaring the profile.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const buildChatAgent = vi.fn(() => ({ kind: 'fake-agent' }))
const toAgentFactory = vi.fn((factory: unknown) => factory)

vi.mock('./chat.js', () => ({ buildChatAgent }))
vi.mock('@theokit/agents', () => ({
  toAgentFactory,
  setDiagnosticsSink: vi.fn(),
}))
vi.mock('@theocode/shared/diagnostic-sink', () => ({ installDiagnosticSink: vi.fn() }))
vi.mock('./auth/index.js', () => ({ resolveFreshCredential: vi.fn() }))

describe('B-001 — the ACP entry declares the headless profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('test_acp_builds_the_agent_with_the_headless_surface', async () => {
    await import('./chat-acp.js')

    // `toAgentFactory` receives the builder; invoking it is what reaches `buildChatAgent`.
    const factory = toAgentFactory.mock.calls[0]?.[0] as () => Promise<unknown>
    expect(factory, 'the ACP entry did not hand a factory to `toAgentFactory`').toBeTypeOf('function')
    await factory()

    expect(
      buildChatAgent,
      'the ACP entry built the agent WITHOUT declaring a surface, so `profileTools` falls through ' +
        "to the 'interactive' default and registers `request_user_input` against a bridge only the " +
        'TUI answers. Every such call stalls for the built-in 5-minute timeout.',
    ).toHaveBeenCalledWith(expect.objectContaining({ surface: 'headless' }))
  })
})
