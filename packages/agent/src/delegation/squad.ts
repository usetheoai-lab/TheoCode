import { homedir } from 'node:os'

import { Agent, type HookHandlers, type SDKAgent, Squad, Tool } from '@theokit/agents'
import { z } from 'zod'

import { type AgentConfig, type TrustPosture } from '../config/index.js'
import { resolveFreshCredential } from '../auth/index.js'
import { resolveToolScope } from '../tools/index.js'
import { buildRoleAgent, roleAgentOptions, TEAM_ROLES, type RoleAgentContext } from './roles.js'
import { withDelegationCap } from './delegation-cap.js'

export async function teamMemberOptions(
  ctx: RoleAgentContext,
): Promise<Parameters<typeof Agent.create>[0][]> {
  return Promise.all(TEAM_ROLES.map((role) => roleAgentOptions(role, ctx)))
}

export async function buildTeam(
  ctx: RoleAgentContext,
): Promise<{ squad: Squad; members: SDKAgent[] }> {
  const members = await Promise.all(TEAM_ROLES.map((role) => buildRoleAgent(role, ctx)))
  const squad = Squad.create({ agents: members, process: 'sequential', name: 'theocode-team' })
  return { squad, members }
}

export interface TeamContext {
  model: string
  reasoning_effort: AgentConfig['reasoning_effort']
  sandbox_mode: AgentConfig['sandbox_mode']
  posture: TrustPosture
  hooks?: HookHandlers
}

export function createDelegateToTeamTool(contexto: TeamContext) {
  return Tool.create({
    name: 'delegate_to_team',
    description:
      'Delegate a task to a SEQUENTIAL team of role agents (explorer → worker): the explorer reads the ' +
      'codebase read-only and its findings feed the worker, which makes the scoped change and reports it. ' +
      'This runs the members one after another (cost ≈ sum of both turns), NOT in parallel — reach for it ' +
      'only when an investigate-then-implement pipeline earns the extra tokens. Input: { task }.',
    inputSchema: z.object({
      task: z
        .string()
        .min(1)
        .describe('The task for the team (the explorer investigates it, the worker executes it).'),
    }),
    handler: async ({ task }: { task: string }) => {
      const escopo = resolveToolScope({ sandbox_mode: contexto.sandbox_mode }, process.cwd())
      const { squad, members } = await buildTeam({
        apiKey: () =>
          resolveFreshCredential({ env: process.env, home: homedir() }).then((c) => c.apiKey),
        parent: { model: contexto.model, reasoning_effort: contexto.reasoning_effort },
        posture: contexto.posture,
        cwd: escopo.cwd,
        sandbox: escopo.sandbox,
        writeRoot: escopo.writeRoot,
        ...(contexto.hooks !== undefined ? { hooks: contexto.hooks } : {}),
      })
      try {
        const run = await withDelegationCap(squad.run(task))
        return JSON.stringify({
          result: run.result,
          status: run.status,
          members: TEAM_ROLES,
          steps: run.steps.length,
        })
      } finally {
        await Promise.all(members.map((m) => m[Symbol.asyncDispose]()))
      }
    },
  })
}
