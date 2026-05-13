// examples/local-agent/index.ts
// Example: Explore your local filesystem with Fold
//
// Run: npx tsx examples/local-agent/index.ts

import { Workspace, RAMResource, LocalFSResource } from '@fold/node'

async function main() {
  const ws = new Workspace({
    '/home':    new LocalFSResource({ path: process.env.HOME || process.env.USERPROFILE || '~', readonly: true }),
    '/scratch': new RAMResource(),
  })

  console.log('=== Fold Local Agent Example ===\n')

  // 1. List home directory
  console.log('📁 Listing home directory:')
  const lsResult = await ws.execute('ls /home')
  console.log(lsResult.stdout)
  console.log()

  // 2. Count files
  console.log('📊 File count:')
  const wcResult = await ws.execute('ls /home | wc -l')
  console.log(`  ${wcResult.stdout.trim()} items\n`)

  // 3. Write to scratch
  console.log('✏️  Writing to scratch space:')
  await ws.execute('echo "Agent was here at $(date)" > /scratch/agent-log.txt')
  const catResult = await ws.execute('cat /scratch/agent-log.txt')
  console.log(`  ${catResult.stdout}\n`)

  // 4. Cross-resource copy
  console.log('📋 Demonstrating cross-resource operations:')
  await ws.execute('echo "Meeting notes for today" > /scratch/notes.txt')
  await ws.execute('cp /scratch/notes.txt /scratch/backup-notes.txt')
  const backupResult = await ws.execute('cat /scratch/backup-notes.txt')
  console.log(`  Backup content: ${backupResult.stdout}`)

  // 5. Pipe operations
  console.log('\n🔗 Pipe operations:')
  await ws.execute('echo "error: timeout\ninfo: ok\nerror: crash\ninfo: done" > /scratch/log.txt')
  const grepResult = await ws.execute('grep error /scratch/log.txt | wc -l')
  console.log(`  Found ${grepResult.stdout.trim()} errors in log\n`)

  // 6. Watch for changes
  console.log('👁️  Setting up file watcher:')
  const unsub = ws.watch('/scratch', (event) => {
    console.log(`  [watch] ${event.type}: ${event.path}`)
  })
  await ws.execute('echo "new file" > /scratch/watched.txt')
  unsub()

  console.log('\n✅ Done!')
}

main().catch(console.error)
