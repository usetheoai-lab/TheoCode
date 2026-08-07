export const APPROVAL_MODES = ['suggest', 'auto-edit', 'full-auto'] as const

export type ApprovalMode = (typeof APPROVAL_MODES)[number]

const EDIT_TOOLS = new Set(['apply_patch'])

/**
 * B-006 — `full-auto` means "run commands without asking", which is only defensible when something
 * else is doing the confining. The headless surface already refuses this combination in writing
 * (`agent/config/approval-policy.ts`): *refusing instead of claiming a confinement that does not
 * exist*. This surface used to auto-approve regardless, while the same screen rendered
 * `sandbox:<mode> ⚠ tool-gating` to tell the user there was none.
 *
 * An absent posture counts as unconfined. Absence of evidence is not evidence of confinement, and
 * defaulting the other way would silently disable the guard anywhere the posture has not been
 * threaded through.
 *
 * `auto-edit` is deliberately unchanged: `apply_patch` is bounded by the tool's own write scope
 * rather than by the kernel, and the user opted into edits specifically. The headless refusal is
 * about running commands blind, not about editing files.
 */
export function shouldAutoApprove(
  mode: ApprovalMode,
  toolName: string,
  posture?: { enforced: boolean; detail: string },
): boolean {
  switch (mode) {
    case 'suggest':
      return false
    case 'auto-edit':
      return EDIT_TOOLS.has(toolName)
    case 'full-auto':
      return posture?.enforced === true
  }
}

export function parseApprovalMode(input: string): ApprovalMode | undefined {
  return (APPROVAL_MODES as readonly string[]).includes(input) ? (input as ApprovalMode) : undefined
}

export function nextApprovalMode(mode: ApprovalMode): ApprovalMode {
  const i = APPROVAL_MODES.indexOf(mode)
  return APPROVAL_MODES[(i + 1) % APPROVAL_MODES.length]
}
