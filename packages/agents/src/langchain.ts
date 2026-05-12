// packages/agents/src/langchain.ts
// LangChain adapter — wraps Fold Workspace as a tool

import type { Workspace } from '@fold/core'

/**
 * Create LangChain-compatible tools from a Fold Workspace.
 * Uses @langchain/core's DynamicTool for maximum compatibility.
 *
 * @example
 * ```ts
 * import { foldTools } from '@fold/agents'
 * const tools = foldTools(workspace)
 * ```
 */
export function foldTools(workspace: Workspace) {
  const { DynamicTool } = require('@langchain/core/tools') as typeof import('@langchain/core/tools')
  return [
    new DynamicTool({
      name: 'bash',
      description:
        'Run a bash command against the Fold virtual filesystem. ' +
        'Supports cat, ls, ls -c, cp, grep, wc, head, tail, find, and pipes.',
      func: async (command: string) => {
        const result = await workspace.execute(command)
        return result.stdout || result.stderr
      },
    }),
  ]
}
