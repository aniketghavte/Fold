<p align="center">
  <h1 align="center">Fold</h1>
  <p align="center"><strong>The unified virtual filesystem for AI agents</strong></p>
  <p align="center">
    <a href="#quickstart">Quickstart</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#resources">Resources</a> •
    <a href="#mcp">MCP Server</a> •
    <a href="#agents">Agent Adapters</a>
  </p>
</p>

---

**Fold** gives AI agents a single, bash-like interface to interact with *any* data source — local files, databases, cloud storage, APIs, and even local LLMs — all through familiar filesystem semantics.

```typescript
import { Workspace, LocalFSResource, SQLiteResource, OllamaResource } from '@fold/node'

const ws = new Workspace({
  '/notes':  new LocalFSResource({ path: '~/Documents' }),
  '/db':     new SQLiteResource({ path: './data.db' }),
  '/model':  new OllamaResource(),
})

// The agent sees one tree. Every command works across all resources.
await ws.execute('ls -c /db')            // tables with row counts + schema
await ws.execute('cat /db/users/42')     // row as JSON
await ws.execute('grep "TODO" /notes')   // search local files
await ws.execute('cat /model/llama3/summarize this project')  // LLM inference
await ws.execute('cp /db/users/42 /notes/user-backup.json')   // cross-resource copy
```

## Why Fold?

| Feature | Existing Tools | Fold |
|---------|---------------|------|
| **Local-first** | Cloud-only, data leaves your machine | Runs 100% on-device, zero API keys required |
| **Reactive** | Pull-only, agent must poll | Push + pull — Slack message arrives → agent fires automatically |
| **Rich context** | `ls` returns bare filenames | `ls -c` returns metadata, schemas, counts — agent understands in one call |
| **MCP native** | No MCP support | Exposes workspace as MCP server for Claude, Cursor, any client |
| **Universal** | Each data source needs custom code | One interface for files, DBs, S3, Slack, Redis, GitHub, Ollama |

## Quickstart

```bash
# Install the Node.js package (includes all resources)
npm install @fold/node

# Optional: install resource-specific deps as needed
npm install better-sqlite3        # for SQLiteResource
npm install @aws-sdk/client-s3    # for S3Resource
npm install ioredis               # for RedisResource
```

### Hello World

```typescript
import { Workspace, RAMResource } from '@fold/node'

const ws = new Workspace({
  '/scratch': new RAMResource(),
})

await ws.execute('echo "Hello from Fold!" > /scratch/hello.txt')
const result = await ws.execute('cat /scratch/hello.txt')
console.log(result.stdout) // → "Hello from Fold!"
```

### Local Filesystem

```typescript
import { Workspace, LocalFSResource } from '@fold/node'

const ws = new Workspace({
  '/docs': new LocalFSResource({ path: '~/Documents' }),
  '/code': new LocalFSResource({ path: '~/Projects', readonly: true }),
})

// Rich listing with metadata
await ws.execute('ls -c /docs')
// Search across files
await ws.execute('grep -r "TODO" /code | head -n 20')
// Copy between mounts
await ws.execute('cp /code/notes.md /docs/backup-notes.md')
```

### SQLite as a Filesystem

```typescript
import { Workspace, SQLiteResource } from '@fold/node'

const ws = new Workspace({
  '/db': new SQLiteResource({ path: './app.db' }),
})

await ws.execute('ls -c /db')              // list tables with row counts + schemas
await ws.execute('cat /db/users/42')       // read row 42 as JSON
await ws.execute('ls /db/orders')          // list all order PKs
```

### Reactive Monitoring

```typescript
import { Workspace, LocalFSResource } from '@fold/node'

const ws = new Workspace({
  '/logs': new LocalFSResource({ path: '/var/log' }),
})

// Watch fires your handler when files change
ws.watch('/logs', (event) => {
  console.log(`${event.type}: ${event.path}`)
  // Your agent logic here — auto-trigger on new log entries
})
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                        Workspace                         │
│  ┌────────────┐ ┌────────────┐ ┌───────────────────────┐ │
│  │  Executor   │ │   Cache    │ │   Reactive Engine     │ │
│  │  (13 cmds)  │ │ (RAM/Redis)│ │   (push events)       │ │
│  └────────────┘ └────────────┘ └───────────────────────┘ │
├──────────────────────────────────────────────────────────┤
│                    Mount Table                           │
│  /notes  → LocalFSResource                              │
│  /db     → SQLiteResource                                │
│  /s3     → S3Resource                                    │
│  /slack  → SlackResource                                 │
│  /model  → OllamaResource                                │
└──────────────────────────────────────────────────────────┘
```

## Resources

| Resource | Package | Description | Deps |
|----------|---------|-------------|------|
| `RAMResource` | `@fold/node` | In-memory filesystem | None |
| `LocalFSResource` | `@fold/node` | Local filesystem with path protection | None |
| `SQLiteResource` | `@fold/node` | Tables as dirs, rows as JSON files | `better-sqlite3` |
| `OllamaResource` | `@fold/node` | Local LLM inference as file reads | None (uses fetch) |
| `S3Resource` | `@fold/node` | S3/R2/MinIO objects | `@aws-sdk/client-s3` |
| `SlackResource` | `@fold/node` | Channels as dirs, messages as JSONL | `@slack/web-api` |
| `GitHubResource` | `@fold/node` | Repos and files via GitHub API | None (uses fetch) |
| `RedisResource` | `@fold/node` | Redis keys as files | `ioredis` |

## Built-in Commands

| Command | Description |
|---------|-------------|
| `cat <path>` | Read file contents |
| `ls <path>` | List directory (`-l` long, `-c` rich context) |
| `cp <src> <dst>` | Copy (works across resources) |
| `mv <src> <dst>` | Move (works across resources) |
| `rm <path>` | Delete file or directory |
| `grep <pattern> <files>` | Search file contents |
| `wc` | Count lines (`-l`), words (`-w`), bytes (`-c`) |
| `head -n N` | First N lines |
| `tail -n N` | Last N lines |
| `find <path> -name <glob>` | Recursive file search |
| `echo <text>` | Write text to stdout |
| `mkdir <path>` | Create directory |
| `jq <query>` | Basic JSON path query |

Supports **pipes** (`|`), **output redirects** (`>`, `>>`), and **quoted strings**.

## MCP Server

Expose any Fold workspace to Claude, Cursor, or any MCP client:

```bash
npm install @fold/mcp
```

```typescript
// mcp-server.ts
import { Workspace, LocalFSResource, SQLiteResource } from '@fold/node'
import { startMCPServer } from '@fold/mcp'

const ws = new Workspace({
  '/notes': new LocalFSResource({ path: '~/Documents' }),
  '/db':    new SQLiteResource({ path: './data.db' }),
})

await startMCPServer(ws)
```

Add to your Claude/Cursor MCP config:
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

## Agent Adapters

```bash
npm install @fold/agents
```

### LangChain / LangGraph

```typescript
import { foldTools, foldLangGraphTools } from '@fold/agents'

// LangChain
const tools = foldTools(workspace)

// LangGraph
const lgTools = foldLangGraphTools(workspace)
```

### Vercel AI SDK

```typescript
import { foldTool } from '@fold/agents'
import { generateText } from 'ai'

const tools = foldTool(workspace)
const result = await generateText({ model, tools, prompt })
```

## Packages

| Package | Description |
|---------|-------------|
| [`@fold/core`](./packages/core) | Runtime-agnostic interfaces, workspace, executor, cache, reactive engine |
| [`@fold/node`](./packages/node) | Node.js resources (RAM, LocalFS, SQLite, S3, Slack, Ollama, GitHub, Redis) |
| [`@fold/mcp`](./packages/mcp) | MCP server — expose workspace to Claude/Cursor |
| [`@fold/agents`](./packages/agents) | LangChain, LangGraph, Vercel AI SDK adapters |

## Custom Resources

Build your own resource by implementing 5 methods:

```typescript
import { Resource, Entry, FileStat } from '@fold/core'

class MyResource implements Resource {
  async list(path: string): Promise<Entry[]> { /* ... */ }
  async read(path: string): Promise<Buffer> { /* ... */ }
  async write(path: string, data: Buffer): Promise<void> { /* ... */ }
  async stat(path: string): Promise<FileStat> { /* ... */ }
  async delete(path: string): Promise<void> { /* ... */ }
}

const ws = new Workspace({ '/custom': new MyResource() })
```

Add reactive support with `subscribe()` or rich listings with `listWithContext()`.

## Custom Commands

```typescript
ws.command('summarize', async (args, ws) => {
  const content = await ws.readFile(args[0])
  // Your logic here
  return `Summary of ${args[0]}: ${content.length} bytes`
})

await ws.execute('summarize /notes/report.md')
```

## License

Apache-2.0
