import {
  authFilePath as authFilePathDoStore,
  AuthProvider,
  CredentialError,
  credentialHome as credentialHomeDoStore,
  readAuthFile as readAuthFileDoStore,
  writeCredential as writeCredentialDoStore,
} from '@theokit/agents/auth'
import { isTransientError } from '@theokit/agents'
import { z } from 'zod'

import { OPENAI_OAUTH_CONFIG, credentialStore } from './oauth-config.js'

const PROVIDERS = ['openrouter', 'anthropic', 'openai'] as const
export type Provider = (typeof PROVIDERS)[number]

const PREFIXES: Readonly<Record<Provider, string>> = {
  anthropic: 'sk-ant-',
  openrouter: 'sk-or-',
  openai: 'sk-',
}

const PREFIXES_BY_LENGTH: ReadonlyArray<readonly [Provider, string]> = (
  Object.entries(PREFIXES) as Array<[Provider, string]>
).sort((a, b) => b[1].length - a[1].length)

const ENV_KEYS: ReadonlyArray<readonly [Provider, string]> = [
  ['openrouter', 'OPENROUTER_API_KEY'],
  ['anthropic', 'ANTHROPIC_API_KEY'],
  ['openai', 'OPENAI_API_KEY'],
]

export function credentialHome(home: string, env: Record<string, string | undefined> = {}): string {
  return credentialHomeDoStore(credentialStore(home), env)
}

export const authFilePath = (home: string, env: Record<string, string | undefined> = {}): string =>
  authFilePathDoStore(credentialStore(home), env)

export function ensureAuthHome(env: Record<string, string | undefined>, home: string): string {
  return (env.THEOKIT_AUTH_HOME ??= credentialHome(home, env))
}

export { CredentialError }

export class MissingCredentialError extends CredentialError {
  override readonly name = 'MissingCredentialError'
  readonly attempts: readonly string[]
  constructor(message: string, attempts: readonly string[]) {
    super(message)
    this.attempts = attempts
  }
}

export interface ResolvedCredential {
  kind: 'api' | 'oauth'
  provider: Provider
  apiKey: string
  source: string
  inferred: boolean
  expiresAt?: number
}

export function inferProvider(apiKey: string): Provider | undefined {
  for (const [provider, prefix] of PREFIXES_BY_LENGTH) {
    if (apiKey.startsWith(prefix)) return provider
  }
  return undefined
}

const apiFileSchema = z
  .object({
    type: z.literal('api').optional(),
    provider: z.enum(PROVIDERS).optional(),
    api_key: z.string(),
  })
  .strict()

const oauthFileSchema = z
  .object({
    type: z.literal('oauth'),
    provider: z.enum(PROVIDERS),
    access: z.string().min(1),
    refresh: z.string().min(1),
    expires: z.number(),
    account_id: z.string().optional(),
  })
  .strict()

const fileSchema = z.union([oauthFileSchema, apiFileSchema])

interface StoredApiCredential {
  type?: 'api'
  provider?: Provider
  api_key: string
}
export interface StoredOAuthCredential {
  type: 'oauth'
  provider: Provider
  access: string
  refresh: string
  expires: number
  account_id?: string
}
type StoredCredential = StoredApiCredential | StoredOAuthCredential

function readAuthFile(
  home: string,
  env: Record<string, string | undefined>,
): StoredCredential | undefined {
  const stored = readAuthFileDoStore(credentialStore(home), env)
  if (stored === undefined) return undefined
  const parsed = fileSchema.safeParse(stored)
  if (!parsed.success) {
    throw new CredentialError(
      `${authFilePath(home, env)} declares a provider this build does not support. ` +
        `Supported: ${PROVIDERS.join(', ')}.`,
    )
  }
  return parsed.data as StoredCredential
}

function assertPairMatches(provider: Provider, apiKey: string, where: string): void {
  const expected = PREFIXES[provider]
  if (expected !== undefined && !apiKey.startsWith(expected)) {
    throw new CredentialError(
      `${where}: the key declared for provider "${provider}" does not start with "${expected}". ` +
        `Either the provider or the key is wrong; sending it would fail mid-request.`,
    )
  }
}

function storedCredentialOf(
  provider: Provider,
  home: string,
  env: Record<string, string | undefined>,
): ResolvedCredential | undefined {
  const stored = readAuthFile(home, env)
  if (stored === undefined || stored.provider !== provider) return undefined
  const source = authFilePath(home, env)
  if (stored.type === 'oauth') {
    return {
      kind: 'oauth',
      provider,
      apiKey: stored.access,
      source,
      inferred: false,
      expiresAt: stored.expires,
    }
  }
  if (stored.api_key.length === 0) return undefined
  assertPairMatches(provider, stored.api_key, source)
  return { kind: 'api', provider, apiKey: stored.api_key, source, inferred: false }
}

function declaredProvider(env: Record<string, string | undefined>): Provider | undefined {
  const declared = env.THEOCODE_PROVIDER?.trim()
  if (declared === undefined) return undefined
  if (!(PROVIDERS as readonly string[]).includes(declared)) {
    throw new CredentialError(
      `THEOCODE_PROVIDER is "${declared.slice(0, 12)}${declared.length > 12 ? '…' : ''}" ` +
        `— expected one of ${PROVIDERS.join(', ')}`,
    )
  }
  return declared as Provider
}

function resolveDeclaredProvider(
  env: Record<string, string | undefined>,
  home: string | undefined,
): ResolvedCredential | undefined {
  const provider = declaredProvider(env)
  if (provider === undefined) return undefined
  const varName = ENV_KEYS.find(([p]) => p === provider)?.[1] ?? ''
  const fromEnv = env[varName]
  if (fromEnv !== undefined && fromEnv.length > 0) {
    assertPairMatches(provider, fromEnv, varName)
    return { kind: 'api', provider, apiKey: fromEnv, source: varName, inferred: false }
  }
  const armazenada = home === undefined ? undefined : storedCredentialOf(provider, home, env)
  if (armazenada !== undefined) return armazenada
  throw new CredentialError(
    `provider "${provider}" is declared via THEOCODE_PROVIDER but no key for it was found ` +
      `(looked at ${varName}${home !== undefined ? ` and ${authFilePath(home, env)}` : ''}). ` +
      `Refusing to fall back to a different provider's credential.`,
  )
}

function resolveFromFile(
  home: string,
  env: Record<string, string | undefined>,
  attempts: string[],
): ResolvedCredential | undefined {
  const path = authFilePath(home, env)
  attempts.push(path)
  const stored = readAuthFile(home, env)
  if (stored !== undefined) {
    if (stored.type === 'oauth') {
      return {
        kind: 'oauth',
        provider: stored.provider,
        apiKey: stored.access,
        source: path,
        inferred: false,
        expiresAt: stored.expires,
      }
    }
    if (stored.api_key.length > 0) {
      const provider = stored.provider ?? inferProvider(stored.api_key)
      if (provider === undefined) {
        throw new CredentialError(
          `${path}: cannot tell which provider this key belongs to. ` +
            `Add "provider": one of ${PROVIDERS.join(', ')}.`,
        )
      }
      assertPairMatches(provider, stored.api_key, path)
      return {
        kind: 'api',
        provider,
        apiKey: stored.api_key,
        source: path,
        inferred: stored.provider === undefined,
      }
    }
  }
  return undefined
}

export function resolveCredential(opts: {
  env: Record<string, string | undefined>
  home: string | undefined
}): ResolvedCredential {
  const { env, home } = opts
  const attempts: string[] = []

  const declaredByEnv = resolveDeclaredProvider(env, home)
  if (declaredByEnv !== undefined) return declaredByEnv

  for (const [provider, varName] of ENV_KEYS) {
    attempts.push(varName)
    const value = env[varName]
    if (value !== undefined && value.length > 0) {
      assertPairMatches(provider, value, varName)
      return { kind: 'api', provider, apiKey: value, source: varName, inferred: false }
    }
  }

  const fromTheFile = home === undefined ? undefined : resolveFromFile(home, env, attempts)
  if (fromTheFile !== undefined) return fromTheFile

  throw new MissingCredentialError(
    `No provider credential found. Tried, in order:\n` +
      attempts.map((a, i) => `  ${i + 1}. ${a}`).join('\n') +
      `\n\nSet one of those environment variables, or create the credential file:\n` +
      `  ${home !== undefined ? authFilePath(home, env) : '~/.theocode/auth.json'}\n` +
      `  {"provider": "openrouter", "api_key": "sk-or-..."}   (mode 0600)`,
    attempts,
  )
}

function isOAuthWrite(
  c: { provider: Provider; apiKey: string } | StoredOAuthCredential,
): c is StoredOAuthCredential {
  return 'type' in c && c.type === 'oauth'
}

export function writeCredential(
  cred: { provider: Provider; apiKey: string } | StoredOAuthCredential,
  home: string,
  env: Record<string, string | undefined> = {},
): string {
  if (isOAuthWrite(cred)) {
    if (cred.access.length === 0 || cred.refresh.length === 0) {
      throw new CredentialError(
        'refusing to write an oauth credential with an empty access/refresh token',
      )
    }
  } else {
    if (typeof cred.apiKey !== 'string' || cred.apiKey.length === 0) {
      throw new CredentialError('refusing to write an empty API key')
    }
    assertPairMatches(cred.provider, cred.apiKey, 'the credential being written')
  }

  return writeCredentialDoStore(
    isOAuthWrite(cred) ? cred : { provider: cred.provider, apiKey: cred.apiKey },
    credentialStore(home),
    env,
  )
}

export function classifyRefreshFailure(err: unknown): {
  readonly transiente: boolean
  readonly causa: unknown
} {
  return { transiente: isTransientError(err), causa: err }
}

export async function resolveFreshCredential(opts: {
  env: Record<string, string | undefined>
  home: string | undefined
  fetch?: typeof fetch
  now?: () => number
  timeoutMs?: number
}): Promise<ResolvedCredential> {
  const resolved = resolveCredential({ env: opts.env, home: opts.home })
  if (resolved.kind !== 'oauth' || opts.home === undefined) return resolved
  if (resolved.provider !== 'openai') return resolved
  const baseFetch = opts.fetch ?? fetch
  const timeoutMs = opts.timeoutMs ?? 30_000
  const boundedFetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    baseFetch(input, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    })) as typeof fetch
  let fresh: Awaited<ReturnType<AuthProvider['ensureFresh']>>
  try {
    fresh = await new AuthProvider(OPENAI_OAUTH_CONFIG, credentialStore(opts.home)).ensureFresh(
      resolved,
      { fetch: boundedFetch, now: opts.now ?? Date.now },
      opts.env,
    )
  } catch (err) {
    const { transiente } = classifyRefreshFailure(err)
    if (!transiente) throw err
    return resolved
  }
  return { ...fresh, provider: resolved.provider }
}

export async function resolveCredentialForModel(
  model: string | undefined,
  opts: {
    env: Record<string, string | undefined>
    home: string | undefined
    fetch?: typeof fetch
    now?: () => number
    timeoutMs?: number
  },
): Promise<ResolvedCredential> {
  if (model !== undefined && model.startsWith('openai-chatgpt/')) {
    return resolveFreshCredential({ ...opts, env: {} })
  }
  return resolveFreshCredential(opts)
}
