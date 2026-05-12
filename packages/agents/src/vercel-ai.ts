// packages/agents/src/vercel-ai.ts
// Vercel AI SDK adapter — wraps Fold Workspace as a Vercel AI tool

import type { Workspace } from '@fold/core'

/**
 * Create Vercel AI SDK tools from a Fold Workspace.
 *
 * @example
 * ```ts
 * import { foldTool } from '@fold/agents'
 * const tools = foldTool(workspace)
 * const result = await generateText({ model, tools, prompt })
 * ```
 */
export function foldTool(workspace: Workspace): Record<string, unknown> {
  const aiModule = require('ai') as { tool: Function }
  const { z } = require('zod') as typeof import('zod')

  return {
    bash: aiModule.tool({
      description: 'Run bash commands against the Fold virtual filesystem',
      parameters: z.object({ command: z.string() }),
      execute: async ({ command }: { command: string }) => {
        const result = await workspace.execute(command)
        return result.stdout || result.stderr
      },
    }),
  }
}
