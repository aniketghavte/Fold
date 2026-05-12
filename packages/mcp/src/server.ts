// packages/mcp/src/server.ts
// MCP Server — exposes a Fold Workspace as an MCP server.
// Any MCP client (Claude, Cursor, etc.) can use it with zero adapter code.

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { Workspace } from '@fold/core'

/**
 * Create an MCP Server backed by a Fold Workspace.
 * Exposes a single `bash` tool that runs commands against the VFS.
 */
export function createMCPServer(workspace: Workspace): Server {
  const server = new Server(
    { name: 'fold', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )

  // Register tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'bash',
        description:
          'Execute a bash command against the Fold virtual filesystem. ' +
          'Supports: cat, ls, ls -c (rich context), cp, mv, rm, grep, wc, head, tail, find, echo, jq, mkdir, and pipes (|), redirects (>, >>).',
        inputSchema: {
          type: 'object' as const,
          properties: {
            command: {
              type: 'string',
              description: 'The bash command to run against the virtual filesystem',
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'ls',
        description:
          'List the contents of a directory in the Fold virtual filesystem with rich context metadata. ' +
          'Returns file/directory names with metadata like row counts, schemas, member counts, etc.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            path: {
              type: 'string',
              description: 'The VFS path to list (default: /)',
            },
          },
          required: [],
        },
      },
    ],
  }))

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    if (name === 'bash') {
      const command = (args as Record<string, unknown>).command as string
      const result = await workspace.execute(command)
      return {
        content: [
          {
            type: 'text' as const,
            text: result.stdout || result.stderr || '(no output)',
          },
        ],
        isError: result.exitCode !== 0,
      }
    }

    if (name === 'ls') {
      const path = ((args as Record<string, unknown>).path as string) ?? '/'
      const result = await workspace.execute(`ls -c ${path}`)
      return {
        content: [
          {
            type: 'text' as const,
            text: result.stdout || result.stderr || '(empty directory)',
          },
        ],
        isError: result.exitCode !== 0,
      }
    }

    return {
      content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
      isError: true,
    }
  })

  return server
}

/**
 * Start the MCP server on stdio transport.
 * Run this as a sidecar process — Claude/Cursor connects via stdio.
 *
 * @example
 * ```ts
 * import { Workspace, LocalFSResource } from '@fold/node'
 * import { startMCPServer } from '@fold/mcp'
 *
 * const ws = new Workspace({
 *   '/notes': new LocalFSResource({ path: '~/Documents' }),
 * })
 * await startMCPServer(ws)
 * ```
 */
export async function startMCPServer(workspace: Workspace): Promise<void> {
  const server = createMCPServer(workspace)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Fold MCP server running on stdio')
}
