import type { HookApprovalRequest } from '@theokit/agents'

/**
 * #130 — the answer this product gives when the framework asks whether to spawn a hook IT loaded.
 *
 * ## Which hooks reach this gate, and why the answer is always no
 *
 * This product's own hooks never do. They come from `settings.json`, are translated by
 * `buildHookHandlers`, and are handed to the framework with a `fingerprint` callback that resolves
 * each one against the on-disk approval store. That gate already exists and already works.
 *
 * What reaches HERE is the other path: the framework's compatibility loader reads
 * `<cwd>/.claude/settings.json` and `<cwd>/.theokit/hooks.json` itself, and spawns what it finds
 * without ever passing through `buildHookHandlers`. Measured before the gate existed: a hook
 * declared in a project `.claude/settings.json` fired once, with no approval prompt and no approval
 * file written, against a control arm at zero where the same tool still ran.
 *
 * So every request arriving here is by construction a hook this product did not translate, did not
 * fingerprint, and was never asked to approve. Refusing is not a policy choice made here — it is
 * the policy the README and `doctor` have stated all along, finally reaching the point of action.
 *
 * ## Why not approve them against the store instead
 *
 * Because the two identities cannot be made to agree, and pretending otherwise would be worse than
 * refusing. This product's fingerprint hashes `{command, event, matcher, timeoutMs}`;
 * {@link HookApprovalRequest} carries no timeout, and its `event` vocabulary is the framework's
 * (`preToolUse`) rather than the dialect's (`PreToolUse`). Matching on the subset that survives
 * would be a SECOND fingerprint answering the same security question — and two identities for one
 * gate is how gates drift apart until one of them approves what the other refuses.
 *
 * Running a foreign root's hooks under this product's approval is a real thing to want. It needs an
 * identity both sides can compute, which is a design question and not a predicate.
 *
 * ## A refusal is not a denial
 *
 * The framework treats a refused hook as one that was never configured: the operation the hook
 * attached to still proceeds. That is the contract this product asked for — the command should not
 * run; the work should not stop. A refused hook must never be more disruptive than an absent one.
 */
export function refuseForeignHook(_request: HookApprovalRequest): false {
  return false
}

/**
 * What to tell the operator once, when the framework asked and this gate said no.
 *
 * Names the file. "A hook was refused" sends someone reading every settings file in the repository;
 * naming the path ends the search, and the second sentence says where hooks DO run so the message
 * is an instruction rather than a complaint.
 */
export function refusalNotice(request: HookApprovalRequest): string {
  const where = request.sourcePath ?? 'a file this product does not read hooks from'
  return (
    `hook not run: \`${request.command}\` (${request.event}) is declared in ${where}, which this ` +
    `product does not run hooks from — the framework loads that file directly, so the command ` +
    `would spawn without this product's per-hook approval (#130). Move it to ` +
    `.theocode/settings.json to have it approved and run.`
  )
}
