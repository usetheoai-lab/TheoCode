export const APPROVAL_MODES = ['suggest', 'auto-edit', 'full-auto'] as const

export type ApprovalMode = (typeof APPROVAL_MODES)[number]

const EDIT_TOOLS = new Set(['apply_patch'])

export function shouldAutoApprove(mode: ApprovalMode, toolName: string): boolean {
  switch (mode) {
    case 'suggest':
      return false
    case 'auto-edit':
      return EDIT_TOOLS.has(toolName)
    case 'full-auto':
      return true
  }
}

export function parseApprovalMode(input: string): ApprovalMode | undefined {
  return (APPROVAL_MODES as readonly string[]).includes(input) ? (input as ApprovalMode) : undefined
}

export function nextApprovalMode(mode: ApprovalMode): ApprovalMode {
  const i = APPROVAL_MODES.indexOf(mode)
  return APPROVAL_MODES[(i + 1) % APPROVAL_MODES.length]
}
