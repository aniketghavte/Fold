# @tbc-fold/mcp

Expose any Fold workspace as an MCP server. Any MCP client — Claude, Cursor, Windsurf, or custom — can use your virtual filesystem with zero additional code.

## Installation

```bash
npm install @tbc-fold/mcp @tbc-fold/node
```

## Usage

### As a Library

```typescript
import { Workspace, LocalFSResource, SQLiteResource } from '@tbc-fold/node'
import { startMCPServer } from '@tbc-fold/mcp'

const ws = new Workspace({
  '/notes': new LocalFSResource({ path: '~/Documents' }),
  '/db':    new SQLiteResource({ path: './data.db' }),
})

await startMCPServer(ws)
```

### MCP Client Config

Add to your Claude Desktop or Cursor config:

```json
{
  "mcpServers": {
    "fold": {
      "command": "npx",
      "args": ["tsx", "mcp-server.ts"]
    }
  }
}
```

## Exposed Tools

| Tool | Description |
|------|-------------|
| `bash` | Execute any bash command against the VFS (cat, ls, grep, cp, pipes, etc.) |
| `ls` | List directory with rich context metadata |

## API

```typescript
import { createMCPServer, startMCPServer } from '@tbc-fold/mcp'

// Create server (for custom transport)
const server = createMCPServer(workspace)

// Start on stdio (for Claude/Cursor)
await startMCPServer(workspace)
```

## License

Apache-2.0
