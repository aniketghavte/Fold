#!/usr/bin/env node
// packages/mcp/src/cli.ts
// CLI entry point for fold-mcp server
// Usage: fold-mcp [--dir <path>] [--readonly]

import { Workspace } from '@fold/core'

async function main() {
  const args = process.argv.slice(2)
  const flags = {
    dir: '.',
    readonly: false,
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      flags.dir = args[++i]
    } else if (args[i] === '--readonly') {
      flags.readonly = true
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.error('Usage: fold-mcp [options]')
      console.error('')
      console.error('Options:')
      console.error('  --dir <path>    Directory to expose (default: .)')
      console.error('  --readonly      Mount as read-only')
      console.error('  -h, --help      Show this help')
      process.exit(0)
    }
  }

  // Lazy import to avoid loading everything at parse time
  const { LocalFSResource, RAMResource } = await import('@fold/node')
  const { startMCPServer } = await import('./server')

  const ws = new Workspace({
    '/fs':      new LocalFSResource({ path: flags.dir, readonly: flags.readonly }),
    '/scratch': new RAMResource(),
  })

  console.error(`Fold MCP server starting...`)
  console.error(`  /fs      → ${flags.dir} ${flags.readonly ? '(read-only)' : ''}`)
  console.error(`  /scratch → in-memory`)

  await startMCPServer(ws)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
