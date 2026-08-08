import type { ReactElement } from 'react'

import { PermissionPrompt } from '@theokit/tui'

import { trustDir } from '@theocode/agent/config'
import type { ApprovalMode } from '../consent/index.js'
import type { ReasoningEffort } from '@theocode/agent/config'
import type { ToastPayload } from '../screen-types.js'
import type { Dispatch, SetStateAction } from 'react'
import { AGENT } from '@theocode/shared/agent'

type Consent = ReturnType<typeof import('../consent/index.js').useConsent>

export interface HooksGateProps {
  readonly consent: Consent
  readonly pendingHooks: Consent['pendingHooks']
}

export function HooksGate({ consent, pendingHooks }: HooksGateProps): ReactElement {
  return (
    <PermissionPrompt
      toolType="Review hook"
      command={
        pendingHooks.length > 1
          ? `${pendingHooks.length} hooks need review — one at a time`
          : 'one hook needs review'
      }
      description={((h) =>
        (h.status === 'modified'
          ? `[changed] ${h.spec.event}\n  was: ${h.previousCommand}\n  now: ${h.spec.command}`
          : `[new] ${h.spec.event}\n  ${h.spec.command}`) +
        '\n\nThis command runs on every matching tool call. Approve only what you recognise — ' +
        'declining leaves it inert, and you will be asked again next launch.')(pendingHooks[0]!)}
      onDecision={(decision) => {
        const head = pendingHooks[0]!
        if (decision === 'yes') {
          consent.approveHookConsent(head.spec, (err) => {
            process.stderr.write(`could not persist hook approval: ${err.message}\n`)
          })
        } else consent.refuseHook(head.fingerprint)
        if (pendingHooks.length <= 1) consent.markReviewed()
      }}
    />
  )
}

export interface TrustGateProps {
  readonly consent: Consent
  readonly SESSION: {
    reloadConfig: () => void
    cfg: () => { approvalMode: ApprovalMode }
    effort: () => ReasoningEffort
  }
  readonly setToast: Dispatch<SetStateAction<ToastPayload | null>>
  readonly setApprovalMode: Dispatch<SetStateAction<ApprovalMode>>
  readonly setEffort: Dispatch<SetStateAction<ReasoningEffort>>
  readonly exit: () => void
}

export function TrustGate({
  consent,
  SESSION,
  setToast,
  setApprovalMode,
  setEffort,
  exit,
}: TrustGateProps): ReactElement {
  return (
    <PermissionPrompt
      toolType="Trust directory"
      command={process.cwd()}
      description={`${AGENT.name} will read files here and may run commands or apply patches. Trust only directories you control — an untrusted repo's AGENTS.md could try to hijack the agent. Approve to trust this directory (remembered); reject to quit.`}
      onDecision={(decision) => {
        if (decision === 'yes') {
          void trustDir(process.cwd()).then(
            () => {
              try {
                SESSION.reloadConfig()
                setApprovalMode(SESSION.cfg().approvalMode)
                setEffort(SESSION.effort())
              } catch (err: unknown) {
                setToast({
                  message: `trust granted, but the project config.toml could not be read: ${(err as Error).message} — fix it and restart; this session keeps the previous config`,
                  variant: 'error',
                })
                process.stderr.write(
                  `trust granted, but the project config.toml could not be read: ${(err as Error).message}\n`,
                )
              }
            },
            (err: unknown) => {
              setToast({
                message: `could not persist trust: ${(err as Error).message} — the directory is still untrusted; approve again to retry`,
                variant: 'error',
              })
              consent.distrust()
              process.stderr.write(`could not persist trust: ${(err as Error).message}\n`)
            },
          )
          consent.trust()
        } else {
          exit() 
        }
      }}
    />
  )
}
