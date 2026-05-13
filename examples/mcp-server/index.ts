// examples/mcp-server/index.ts
// Example: Expose your local filesystem to Claude/Cursor via MCP
//
// Run: npx tsx examples/mcp-server/index.ts
// Then configure your MCP client to connect to this server.

import { Workspace, RAMResource, LocalFSResource } from '@fold/node'
import { startMCPServer } from '@fold/mcp'

async function main() {
  const ws = new Workspace({
    '/home':    new LocalFSResource({ path: process.env.HOME || process.env.USERPROFILE || '~', readonly: true }),
    '/scratch': new RAMResource(),
  })

  // Register a custom command for the agent
  ws.command('hello', async () => {
    return 'Hello from the Fold MCP server! Run `ls /home` to explore your filesystem.'
  })

  console.error('Starting Fold MCP server...')
  console.error('Add this to your MCP client config:')
  console.error(JSON.stringify({
    mcpServers: {
      fold: {
        command: 'npx',
        args: ['tsx', 'examples/mcp-server/index.ts'],
      },
    },
  }, null, 2))

  await startMCPServer(ws)
}

main().catch(console.error)
