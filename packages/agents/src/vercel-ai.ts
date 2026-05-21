// packages/agents/src/vercel-ai.ts
// Vercel AI SDK adapter — wraps Fold Workspace as a Vercel AI tool

import type { Workspace } from '@tbc-fold/core'
import type { AgentToolOptions } from './langchain'

/**
 * Create Vercel AI SDK tools from a Fold Workspace.
 *
 * @example
 * ```ts
 * import { foldTool } from '@tbc-fold/agents'
 * const tools = foldTool(workspace)
 * const result = await generateText({ model, tools, prompt })
 * ```
 */
export function foldTool(workspace: Workspace, options?: AgentToolOptions): Record<string, unknown> {
  const aiModule = require('ai') as { tool: Function }
  const { z } = require('zod') as typeof import('zod')

  const readOnlyNote = options?.readOnly 
    ? ' NOTE: You are in a strict READ-ONLY sandbox. Commands like cp, rm, mv, mkdir, and > redirects will be blocked.' 
    : ''

  return {
    bash: aiModule.tool({
      description: 'Run bash commands against the Fold virtual filesystem.' + readOnlyNote,
      parameters: z.object({ command: z.string() }),
      execute: async ({ command }: { command: string }) => {
        const result = await workspace.execute(command, { readOnly: options?.readOnly })
        return result.stdout || result.stderr
      },
    }),
  }
}
