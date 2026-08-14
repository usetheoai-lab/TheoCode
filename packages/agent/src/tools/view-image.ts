/**
 * B-082 — letting the agent look at an image in the working tree.
 *
 * `/image <path>` attaches one to the NEXT turn, which is a USER action: it requires the user to
 * anticipate that a picture matters. A repository holding a design mock, an architecture diagram or
 * a failing-test screenshot was otherwise opaque to the agent.
 *
 * Reuses `readImageAttachment` (parsimony ladder rung 4) — the same reader `/image` uses, so the
 * supported formats, the size ceiling and the typed failures cannot drift between the two entry
 * points into one product.
 */
import { z } from 'zod'

import { Tool, type CustomTool } from '@theokit/agents'
import type { ToolResultContentBlock } from '@theokit/agents'

import { readImageAttachment } from '../context/image-attach.js'
import { resolveImagePath } from './image-root.js'

export function createViewImageTool(opts: { projectRoot: string }): CustomTool {
  return Tool.create({
    name: 'view_image',
    description:
      'Look at an image file in the working tree (png, jpeg, gif, webp). Use it when a diagram, ' +
      'mock or screenshot in the repository is relevant to the task. The path must be inside the ' +
      'workspace.',
    inputSchema: z.object({
      path: z
        .string()
        .describe('Path to the image, relative to the workspace root or absolute inside it.'),
    }),
    // SE16/SE17 — the handler returns validated DATA and `toModelOutput` shapes what the model
    // actually receives. A handler cannot return image blocks directly; this split is the SDK's
    // supported path to a multimodal tool_result, and using it keeps the raw result available to
    // observability while the model gets the picture.
    outputSchema: z.object({ path: z.string(), mimeType: z.string(), data: z.string() }),
    handler: ({ path }: { path: string }) => {
      // Containment first: it throws a typed error the SDK turns into an isError tool_result, so a
      // path outside the workspace is REFUSED to the model rather than silently rewritten.
      const absolute = resolveImagePath(opts.projectRoot, path)
      const image = readImageAttachment(absolute)
      return { path, mimeType: image.mimeType, data: image.data }
    },
    toModelOutput: (out: { path: string; mimeType: string; data: string }): ToolResultContentBlock[] => [
      { type: 'text', text: `${out.path} (${out.mimeType})` },
      { type: 'image', source: { type: 'base64', media_type: out.mimeType, data: out.data } },
    ],
  })
}
