// packages/agents/src/langgraph.ts
// LangGraph adapter — wraps Fold Workspace as a @langchain/core tool

import type { Workspace } from '@fold/core'

/**
 * Create LangGraph-compatible tools from a Fold Workspace.
 *
 * @example
 * ```ts
 * import { foldLangGraphTools } from '@fold/agents'
 * const tools = foldLangGraphTools(workspace)
 * ```
 */
export function foldLangGraphTools(workspace: Workspace) {
  const { tool } = require('@langchain/core/tools') as typeof import('@langchain/core/tools')
  const { z } = require('zod') as typeof import('zod')

  return [
    tool(
      async ({ command }: { command: string }) => {
        const result = await workspace.execute(command)
        return result.stdout || result.stderr
      },
      {
        name: 'bash',
        description: 'Run bash commands against the Fold virtual filesystem',
        schema: z.object({ command: z.string() }),
      }
    ),
  ]
}
