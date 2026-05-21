// packages/agents/src/langchain.ts
// LangChain adapter — wraps Fold Workspace as a tool

import type { Workspace } from '@tbc-fold/core'

export interface AgentToolOptions {
  /** If true, the agent is restricted from using mutating commands (cp, rm, mv, mkdir, >) */
  readOnly?: boolean
}

/**
 * Create LangChain-compatible tools from a Fold Workspace.
 * Uses @langchain/core's DynamicTool for maximum compatibility.
 *
 * @example
 * ```ts
 * import { foldTools } from '@tbc-fold/agents'
 * const tools = foldTools(workspace)
 * ```
 */
export function foldTools(workspace: Workspace, options?: AgentToolOptions) {
  const { DynamicTool } = require('@langchain/core/tools') as typeof import('@langchain/core/tools')
  
  const readOnlyNote = options?.readOnly 
    ? ' NOTE: You are in a strict READ-ONLY sandbox. Commands like cp, rm, mv, mkdir, and > redirects will be blocked.' 
    : ''

  return [
    new DynamicTool({
      name: 'bash',
      description:
        'Run a bash command against the Fold virtual filesystem. ' +
        'Supports cat, ls, ls -c, cp, grep, wc, head, tail, find, and pipes.' +
        readOnlyNote,
      func: async (command: string) => {
        const result = await workspace.execute(command, { readOnly: options?.readOnly })
        return result.stdout || result.stderr
      },
    }),
  ]
}
