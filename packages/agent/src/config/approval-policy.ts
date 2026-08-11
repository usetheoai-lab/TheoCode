import type { ApprovalPosture } from '@theokit/agents'
import type { SandboxPosture } from '@theokit/agents/sandbox'

import type { ApprovalPolicy } from './config.js'
import { approvalModeFor } from './sandbox-policy.js'

export interface ApprovalDecision {
  approved: boolean
  reason: string
}

export function resolveHeadlessApproval(
  policy: ApprovalPolicy,
  // B-021 — REQUIRED. Omitting it used to return `approved: true` for full-auto, skipping the
  // enforced-sandbox refusal that is this function's stated purpose.
  posture: { enforced: boolean; detail: string },
): ApprovalDecision {
  const mode = approvalModeFor(policy)
  if (mode === 'full-auto') {
    if (!posture.enforced) {
      return {
        approved: false,
        reason:
          `approval_policy="${policy}" would run without asking, but there is NO enforced sandbox ` +
          `(${posture.detail}) — refusing instead of claiming a confinement that does not exist. ` +
          'Install bwrap, or set an explicit sandbox_mode with kernel enforcement.',
      }
    }
    return {
      approved: true,
      reason:
        `approval_policy="${policy}" runs without asking; confinement is the kernel sandbox` +
        (posture !== undefined ? ` (${posture.detail})` : ''),
    }
  }
  return {
    approved: false,
    reason:
      `approval_policy="${policy}" keeps a human in the loop, and this surface has no human — ` +
      'set approval_policy="never" to run headless, or use the interactive surface',
  }
}

export function headlessApprovalPosture(
  policy: ApprovalPolicy,
  sandbox: SandboxPosture,
): ApprovalPosture {
  const decision = resolveHeadlessApproval(policy, sandbox)
  return decision.approved
    ? { kind: 'auto-approve', reason: decision.reason }
    : { kind: 'auto-reject', reason: decision.reason }
}
