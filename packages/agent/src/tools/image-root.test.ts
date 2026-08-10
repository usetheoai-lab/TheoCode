/**
 * B-082 — the containment rule for `view_image`.
 *
 * The only part of that tool that can be wrong in a way that matters: a path escaping the root
 * hands the model bytes from outside the workspace, and no test elsewhere would notice.
 */
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ImageOutsideRootError, resolveImagePath } from './image-root.js'

const ROOT = '/workspace/project'

describe('B-082 — resolveImagePath', () => {
  it('test_resolves_a_relative_path_inside_the_root', () => {
    expect(resolveImagePath(ROOT, 'docs/diagram.png')).toBe(join(ROOT, 'docs/diagram.png'))
  })

  it('test_accepts_an_absolute_path_that_stays_inside', () => {
    expect(resolveImagePath(ROOT, join(ROOT, 'a/b.png'))).toBe(join(ROOT, 'a/b.png'))
  })

  it('test_refuses_a_path_that_climbs_out', () => {
    expect(() => resolveImagePath(ROOT, '../secrets/id_rsa.png')).toThrow(ImageOutsideRootError)
  })

  it('test_refuses_a_climb_that_returns_below_a_sibling', () => {
    // `/workspace/project-other` shares a PREFIX with the root. A containment check written as
    // `startsWith(root)` accepts it, which is the classic way this rule is got wrong.
    expect(() => resolveImagePath(ROOT, '../project-other/x.png')).toThrow(ImageOutsideRootError)
  })

  it('test_refuses_an_absolute_path_elsewhere', () => {
    expect(() => resolveImagePath(ROOT, '/etc/passwd')).toThrow(ImageOutsideRootError)
  })

  it('test_refuses_the_root_itself', () => {
    // A directory is not an image, and answering "the root" would send a directory to the reader.
    expect(() => resolveImagePath(ROOT, '.')).toThrow(ImageOutsideRootError)
  })

  it('test_the_error_names_the_path_and_the_root', () => {
    try {
      resolveImagePath(ROOT, '/etc/passwd')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as Error).message).toContain('/etc/passwd')
      expect((e as Error).message).toContain(ROOT)
    }
  })
})

/**
 * The wiring half (pillar a). A tool that exists and is not in the registry is dead code, and the
 * name is a contract three layers depend on — B-018 recorded what happens when it drifts.
 */
describe('B-082 — view_image is wired', () => {
  it('test_view_image_is_a_registry_tool_name', async () => {
    const { REGISTRY_TOOL_NAMES } = await import('./registry.js')
    expect(REGISTRY_TOOL_NAMES).toContain('view_image')
  })

  it('test_the_registry_resolves_it_by_name', async () => {
    const { ToolRegistry } = await import('./registry.js')
    const { resolve: resolvePath } = await import('node:path')
    const registry = new ToolRegistry({
      cwd: resolvePath('.'),
      writeRoot: resolvePath('.'),
      sandbox: { kind: 'none' },
    } as never)
    const resolved = registry.resolve(['view_image'])
    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.name).toBe('view_image')
  })
})
