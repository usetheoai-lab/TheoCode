import { existsSync, unlinkSync } from 'node:fs'
import { createInterface } from 'node:readline'

import { CODEX_PROVIDER, loginWithDevice } from '@theokit/agents/auth'
import type { AuthMethod, DeviceAuthProvider } from '@theokit/agents/auth'

import {
  CredentialError,
  authFilePath,
  inferProvider,
  writeCredential,
  type Provider,
} from './credentials.js'
import { credentialStore } from './oauth-config.js'

export interface LoginResult {
  provider: Provider
  path: string
}

export async function readSecret(
  prompt: string,
  io: { input: NodeJS.ReadableStream; output: NodeJS.WritableStream; isTTY: boolean },
): Promise<string> {
  if (!io.isTTY) {
    const chunks: Buffer[] = []
    let size = 0
    try {
      for await (const chunk of io.input) {
        const buf = Buffer.from(chunk)
        size += buf.length
        if (size > 64 * 1024)
          throw new CredentialError('the piped input is too large to be an API key')
        chunks.push(buf)
      }
    } catch (err) {
      if (err instanceof CredentialError) throw err
      throw new CredentialError(`could not read the key from stdin: ${(err as Error).message}`)
    }
    return Buffer.concat(chunks).toString('utf8').trim()
  }

  const rl = createInterface({ input: io.input, output: io.output, terminal: true })
  try {
    io.output.write(prompt)
    // Echo disabled: the key must not land in the terminal, and therefore not in scrollback or a
    // screen recording. `_writeToOutput` is the documented seam for this in node:readline.
    ;(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {}
    const answer = await new Promise<string>((resolve, reject) => {
      rl.question('', resolve)
      rl.once('close', () => reject(new CredentialError('no key was entered — input closed')))
    })
    io.output.write('\n')
    return answer.trim()
  } finally {
    rl.close()
  }
}

export function login(
  apiKey: string,
  home: string,
  opts: { provider?: Provider; env?: Record<string, string | undefined>; overwrite?: boolean } = {},
): LoginResult {
  const key = apiKey.trim()
  if (key.length === 0) {
    throw new CredentialError('no API key was provided — the input was empty')
  }

  const provider = opts.provider ?? inferProvider(key)
  if (provider === undefined) {
    throw new CredentialError(
      'cannot tell which provider this key belongs to. Pass the provider explicitly.',
    )
  }

  refuseIfExists(home, opts.env ?? {}, opts.overwrite)

  const path = writeCredential({ provider, apiKey: key }, home, opts.env ?? {})
  return { provider, path }
}

function refuseIfExists(
  home: string,
  env: Record<string, string | undefined>,
  overwrite?: boolean,
): void {
  const target = authFilePath(home, env)
  if (existsSync(target) && overwrite !== true) {
    throw new CredentialError(
      `a credential already exists at ${target}. Run logout first, or pass overwrite to replace it.`,
    )
  }
}

export interface OAuthLoginResult {
  provider: Provider
  path: string
  accountId?: string
}

export async function oauthDeviceLogin(
  provider: Provider,
  home: string,
  hooks: { onPrompt: (p: { userCode: string; verificationUri: string }) => void },
  deps?: {
    fetch?: typeof fetch
    sleep?: (ms: number) => Promise<void>
    now?: () => number
    env?: Record<string, string | undefined>
    overwrite?: boolean
  },
): Promise<OAuthLoginResult> {
  const target = provedorDe(provider)
  const metodo = target.methods.find((m) => m.type === 'oauth')
  if (metodo === undefined) {
    throw new CredentialError(
      `provider "${provider}" does not offer an OAuth device login. Use an API key (login) instead.`,
    )
  }
  const r = await loginComMetodo(target, metodo, home, hooks, deps)
  return { provider, path: r.path, accountId: r.accountId }
}

const PROVEDORES: Readonly<Record<string, DeviceAuthProvider>> = { openai: CODEX_PROVIDER }

function provedorDe(name: string): DeviceAuthProvider {
  const p = PROVEDORES[name]
  if (p === undefined) {
    throw new CredentialError(
      `provider "${name}" does not offer an OAuth device login. Use an API key (login) instead.`,
    )
  }
  return p
}

export function metodosDe(provider: DeviceAuthProvider | string): readonly AuthMethod[] {
  return typeof provider === 'string' ? provedorDe(provider).methods : provider.methods
}

export function provedoresConhecidos(): readonly string[] {
  return Object.keys(PROVEDORES)
}

export async function loginComMetodo(
  provider: DeviceAuthProvider,
  metodo: AuthMethod,
  home: string,
  hooks: { onPrompt: (p: { userCode: string; verificationUri: string }) => void },
  deps?: {
    fetch?: typeof fetch
    sleep?: (ms: number) => Promise<void>
    now?: () => number
    env?: Record<string, string | undefined>
    overwrite?: boolean
  },
): Promise<{ path: string; accountId?: string }> {
  const env = deps?.env ?? {}
  refuseIfExists(home, env, deps?.overwrite)
  return loginWithDevice(provider, metodo, credentialStore(home), hooks, {
    deps: { fetch: deps?.fetch, sleep: deps?.sleep, now: deps?.now },
    env,
  })
}

export function logout(home: string, env: Record<string, string | undefined> = {}): boolean {
  const path = authFilePath(home, env)
  if (!existsSync(path)) return false
  unlinkSync(path)
  return true
}
