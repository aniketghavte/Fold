# @fold/core

Runtime-agnostic core for the Fold virtual filesystem. Contains all interfaces, the Workspace class, bash executor, cache layer, and reactive engine.

**This package has zero runtime dependencies.** It provides the foundation that `@fold/node` builds on with Node.js-specific resources.

## Installation

```bash
npm install @fold/core
```

## What's Inside

| Module | Description |
|--------|-------------|
| `Resource` | Interface every resource must implement (5 methods) |
| `ReactiveResource` | Optional `subscribe()` for push-based events |
| `ContextualResource` | Optional `listWithContext()` for rich LLM-aware metadata |
| `Workspace` | Mount table, command execution, file operations, watch |
| `Executor` | Bash parser + 13 built-in commands (cat, ls, grep, cp, etc.) |
| `RAMCacheStore` | In-memory cache with TTL |
| `ReactiveEngine` | Path-aware event system with debounce |

## Usage

```typescript
import { Workspace, type Resource } from '@fold/core'

// Implement the Resource interface
class MyResource implements Resource {
  async list(path: string) { return [] }
  async read(path: string) { return Buffer.from('') }
  async write(path: string, data: Buffer) { }
  async stat(path: string) { return { type: 'file' as const, exists: true } }
  async delete(path: string) { }
}

const ws = new Workspace({ '/data': new MyResource() })
const result = await ws.execute('ls /data')
```

## API

See the [root README](../../README.md) for full API reference.

## License

Apache-2.0
