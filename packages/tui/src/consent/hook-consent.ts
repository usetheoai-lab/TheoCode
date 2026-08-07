import type { classifyHooks, loadApprovedHooks, parseHooks } from '@theocode/agent/hooks'

type ParseHooks = typeof parseHooks
type LoadApprovedHooks = typeof loadApprovedHooks
type ClassifyHooks = typeof classifyHooks
type ClassifiedHook = ReturnType<ClassifyHooks>[number]

export interface HookConsentDeps {
  cwd: string
  declined: ReadonlySet<string>
  resolveEffectiveConfig: (opts: { cwd: string }) => { hooks?: unknown }
  parseHooks: ParseHooks
  loadApprovedHooks: LoadApprovedHooks
  classifyHooks: ClassifyHooks
  onError: (err: unknown) => void
}

export function computePendingHooks(deps: HookConsentDeps): ClassifiedHook[] {
  try {
    const specs = deps.parseHooks(deps.resolveEffectiveConfig({ cwd: deps.cwd }).hooks)
    const approved = deps.loadApprovedHooks(deps.cwd)
    return deps
      .classifyHooks(specs, approved, { previousByEvent: true })
      .filter((h) => h.status !== 'trusted' && !deps.declined.has(h.fingerprint))
  } catch (err) {
    if ((err as Error)?.name !== 'HookError') deps.onError(err)
    return []
  }
}
