/**
 * B-034 — the route that forces the file store must not discard the variable that LOCATES it.
 *
 * `resolveCredentialForModel` sends `openai-chatgpt/*` down a path that passes `env: {}`, to ignore
 * the API-key environment variables and force the stored OAuth credential. It discards
 * `THEOCODE_HOME` with them — and that is the `homeEnvVar` of the credential store
 * (`oauth-config.ts` -> `ENV_HOME`). The result is asymmetric and user-visible: the first resolution
 * finds the credential under the overridden home, the routed second one looks in the default home
 * and does not.
 *
 * `git show 47eced3 --stat`, the commit B-007 named as its fix, never touched this file.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { authFilePath, credentialHome, resolveCredentialForModel } from './credentials.js'

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'theocode-cred-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

/** Writes a stored api credential under the home named by THEOCODE_HOME. */
function storeCredential(env: Record<string, string | undefined>): void {
  const dir = credentialHome(home, env)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(
    authFilePath(home, env),
    JSON.stringify({ provider: 'anthropic', api_key: 'sk-ant-stored' }),
    { mode: 0o600 },
  )
}

describe('B-034 — the forced-file-store route keeps the store location', () => {
  it('test_an_overridden_home_is_honoured_on_the_ordinary_route', () => {
    // Anti-vacuity floor: if THEOCODE_HOME never worked, the assertion below would prove nothing.
    const env = { THEOCODE_HOME: join(home, 'custom') }
    storeCredential(env)

    return expect(
      resolveCredentialForModel('anthropic/claude-sonnet-4-5', { env, home }),
    ).resolves.toMatchObject({ apiKey: 'sk-ant-stored' })
  })

  it('test_an_overridden_home_is_honoured_on_the_openai_chatgpt_route', async () => {
    const env = { THEOCODE_HOME: join(home, 'custom') }
    storeCredential(env)

    await expect(
      resolveCredentialForModel('openai-chatgpt/gpt-5', { env, home }),
      'the routed resolution discarded THEOCODE_HOME and looked in the default home',
    ).resolves.toMatchObject({ apiKey: 'sk-ant-stored' })
  })
})
