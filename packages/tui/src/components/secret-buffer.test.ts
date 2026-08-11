/**
 * B-047 — a pasted API key is submitted without its surrounding whitespace.
 *
 * See `secret-buffer.ts` for why this is tested here rather than through the component.
 */
import { describe, expect, it } from 'vitest'

import { appendKeystroke, submittableSecret } from './secret-buffer.js'

describe('B-047 — the submitted secret carries no pasted whitespace', () => {
  it('test_an_ordinary_key_is_submitted_unchanged', () => {
    // Anti-vacuity floor: mangling every input would satisfy the assertions below.
    expect(submittableSecret('sk-ant-secret')).toBe('sk-ant-secret')
  })

  it('test_a_pasted_key_with_a_trailing_newline_is_trimmed', () => {
    expect(submittableSecret('sk-ant-secret\n'), 'the trailing newline reached login()').toBe(
      'sk-ant-secret',
    )
  })

  it('test_a_key_with_surrounding_spaces_is_trimmed', () => {
    expect(submittableSecret('  sk-ant-secret  ')).toBe('sk-ant-secret')
  })

  it('test_a_blank_buffer_submits_nothing', () => {
    // Whitespace only is not a secret. The component cancels on `undefined` rather than storing it.
    expect(submittableSecret('   ')).toBe(undefined)
    expect(submittableSecret('')).toBe(undefined)
  })

  it('test_a_newline_inside_a_pasted_chunk_does_not_extend_the_buffer', () => {
    // A paste is one chunk. The newline that ends it is not a character of the key.
    expect(appendKeystroke('sk-', 'ant\n')).toBe('sk-ant')
    expect(appendKeystroke('', 'a\r\nb')).toBe('ab')
  })
})
