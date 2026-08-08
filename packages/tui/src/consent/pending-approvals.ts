import {
  resolveApprovalId,
  type ApprovalPartLike,
  type MessageLike,
  type NextApproval,
} from './approvals.js'

interface Input {
  messageIndex: number
  toolName: string
  input: unknown
  settled: boolean
}

/**
 * B-011 — measured to be load-bearing, not a duplicate of the SDK's `findPendingApproval`.
 *
 * `findPendingApproval(messages)` is STATELESS: it derives the answer from the thread on every call.
 * This ledger is STATEFUL — it records that an approval was settled locally. The two differ in
 * exactly one window, and it is the window that matters: between the user answering and the SDK's
 * thread reflecting it. A stateless derivation re-reports the same approval during that window,
 * because the thread still shows it pending — so the card the user just dismissed comes back, and a
 * second answer is sent for an approval already answered.
 *
 * `pending-approvals.test.ts` pins that. If a future SDK settles the thread synchronously, the
 * suppression test passes with this file removed — that is the signal it can go.
 */
export interface ApprovalLedger {
  inFlight: Map<string, Input>
  varridasComoFinais: number
}

export function createApprovalLedger(): ApprovalLedger {
  return { inFlight: new Map(), varridasComoFinais: 0 }
}

export function prune(reg: ApprovalLedger, threadLength: number): void {
  if (!Number.isInteger(threadLength) || threadLength < 0) {
    throw new RangeError(`comprimento negativo: ${String(threadLength)}`)
  }
  for (const [id, e] of reg.inFlight) {
    if (e.messageIndex >= threadLength) reg.inFlight.delete(id)
  }
  reg.varridasComoFinais = Math.min(reg.varridasComoFinais, threadLength)
}

function pruneDeadMarkers(reg: ApprovalLedger, threadLength: number): void {
  for (const [id, e] of reg.inFlight) {
    if (e.settled && e.messageIndex < threadLength - 1) reg.inFlight.delete(id)
  }
}

function absorbMessage(reg: ApprovalLedger, message: MessageLike, indice: number): void {
  for (const bruta of message.parts ?? []) {
    const p = bruta as ApprovalPartLike
    if (p.state !== 'approval-requested') continue
    const id = resolveApprovalId(p)
    if (id === undefined || reg.inFlight.has(id)) continue
    reg.inFlight.set(id, {
      messageIndex: indice,
      toolName: typeof p.toolName === 'string' ? p.toolName : 'tool',
      input: p.input,
      settled: false,
    })
  }
}

export function ingest(reg: ApprovalLedger, thread: readonly MessageLike[]): void {
  prune(reg, thread.length)
  for (let i = reg.varridasComoFinais; i < thread.length; i++) {
    absorbMessage(reg, thread[i]!, i)
  }
  reg.varridasComoFinais = Math.max(reg.varridasComoFinais, thread.length - 1)
  pruneDeadMarkers(reg, thread.length)
}

export function settle(reg: ApprovalLedger, id: string): void {
  const e = reg.inFlight.get(id)
  if (e !== undefined) e.settled = true
}

export function findNextApproval(reg: ApprovalLedger): NextApproval | undefined {
  for (const [id, e] of reg.inFlight) {
    if (!e.settled) return { approvalId: id, toolName: e.toolName, input: e.input }
  }
  return undefined
}
