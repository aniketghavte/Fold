# @fold/node

Node.js resources for the Fold virtual filesystem. Includes 8 resource backends that map different data sources to filesystem semantics.

## Installation

```bash
npm install @fold/node

# Install optional dependencies for the resources you need:
npm install better-sqlite3        # SQLiteResource
npm install @aws-sdk/client-s3    # S3Resource
npm install @slack/web-api        # SlackResource
npm install ioredis               # RedisResource
```

## Resources

| Resource | Description | External Deps |
|----------|-------------|---------------|
| `RAMResource` | In-memory filesystem | None |
| `LocalFSResource` | Real local filesystem | None |
| `SQLiteResource` | SQLite tables as dirs, rows as files | `better-sqlite3` |
| `OllamaResource` | Local LLM inference via reads | None (uses fetch) |
| `S3Resource` | S3/R2/MinIO objects | `@aws-sdk/client-s3` |
| `SlackResource` | Channels → dirs, messages → JSONL | `@slack/web-api` |
| `GitHubResource` | Repos and files via API | None (uses fetch) |
| `RedisResource` | Redis keys as files | `ioredis` |

## Quick Examples

```typescript
import { Workspace, RAMResource, LocalFSResource, SQLiteResource } from '@fold/node'

const ws = new Workspace({
  '/scratch': new RAMResource(),
  '/docs':    new LocalFSResource({ path: '~/Documents' }),
  '/db':      new SQLiteResource({ path: './data.db' }),
})

await ws.execute('ls -c /db')          // tables with row counts
await ws.execute('grep TODO /docs')    // search local files
await ws.execute('cp /db/users/1 /scratch/user.json')  // cross-resource
```

## Also Exports

This package re-exports everything from `@fold/core`, so you only need one import:

```typescript
import { Workspace, RAMResource, type Resource, type Entry } from '@fold/node'
```

## License

MIT
