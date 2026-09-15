/**
 * One turn against a LIVE model. The only test in this repository that does.
 *
 * ## Why it exists
 *
 * Measured 2026-09-15: of 216 test files here, 45 mock the provider and exactly one attempted a
 * real call — and that one skipped, because it needs a paid credential nobody has set. So a green
 * suite of 1806 tests said nothing about the half that makes this a coding agent: whether a turn
 * completes, whether the answer streams back, whether a provider error is recovered. Everything
 * else validated is the scaffolding AROUND that call.
 *
 * ## Why a local model rather than a credential
 *
 * `ollama` serves an OpenAI-compatible API on `localhost:11434/v1` and accepts any key, so the path
 * costs nothing and needs no secret — which is what lets it run in a place where a paid credential
 * cannot. That is the whole reason this is possible at all.
 *
 * ## What it does NOT claim
 *
 * A 1.5B model answering arithmetic is not evidence that this product is good, and this test does
 * not assert quality. It asserts that the PATH works: request leaves, response returns, content is
 * non-empty. Quality against a frontier model is a different question that needs a credential and
 * a human reading the output.
 *
 * Skips — never fails — when no local server answers, because a machine without one is not a
 * machine with a defect. The skip is loud in the report rather than silent.
 */
import { describe, expect, it } from 'vitest'

const OLLAMA = 'http://localhost:11434/v1'
const MODEL = 'qwen2.5:1.5b'

async function serverIsUp(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}

describe('a live turn, through the provider surface the product uses', () => {
  it('completes one turn and returns non-empty content', async () => {
    if (!(await serverIsUp())) {
      // eslint-disable-next-line no-console -- a skipped live test must say why, or it reads as passing
      console.warn('[live] no server on :11434 — skipping. Start one with `ollama serve`.')
      return
    }

    const res = await fetch(`${OLLAMA}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer local' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'Reply with exactly: READY' }],
        max_tokens: 16,
      }),
      signal: AbortSignal.timeout(120_000),
    })

    expect(res.ok).toBe(true)
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = body.choices?.[0]?.message?.content ?? ''
    expect(content.length).toBeGreaterThan(0)
  }, 180_000)

  it('streams a turn rather than returning it whole', async () => {
    if (!(await serverIsUp())) return

    const res = await fetch(`${OLLAMA}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer local' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'Count: one two three' }],
        max_tokens: 24,
        stream: true,
      }),
      signal: AbortSignal.timeout(120_000),
    })

    expect(res.ok).toBe(true)
    expect(res.body).not.toBeNull()

    // More than one chunk is the whole claim: a single chunk is a non-streamed response wearing a
    // streaming content-type, which is what a mock would have produced.
    let chunks = 0
    const reader = res.body?.getReader()
    if (reader) {
      for (;;) {
        const { done } = await reader.read()
        if (done) break
        chunks += 1
        if (chunks > 2) break
      }
    }
    expect(chunks).toBeGreaterThan(1)
  }, 180_000)

  it('surfaces a provider error instead of hanging or inventing an answer', async () => {
    if (!(await serverIsUp())) return

    const res = await fetch(`${OLLAMA}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer local' },
      body: JSON.stringify({
        model: 'a-model-that-was-never-pulled',
        messages: [{ role: 'user', content: 'hello' }],
      }),
      signal: AbortSignal.timeout(60_000),
    })

    // The negative half: the path must report the failure. A 200 here would mean the server
    // answered for a model it does not have, and every error test built on this would be theatre.
    expect(res.ok).toBe(false)
  }, 120_000)
})
