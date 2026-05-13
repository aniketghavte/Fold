// examples/slack-monitor/index.ts
// Example: Monitor a Slack workspace with Fold's reactive system
//
// Setup:
//   1. Set SLACK_TOKEN env var (Bot User OAuth Token)
//   2. Set SLACK_APP_TOKEN env var (App-Level Token for socket mode)
//   3. Run: npx tsx examples/slack-monitor/index.ts
//
// This example shows how to use SlackResource with reactive
// subscriptions to auto-trigger on new messages.

import { Workspace, RAMResource, SlackResource } from '@fold/node'

async function main() {
  const token = process.env.SLACK_TOKEN
  const appToken = process.env.SLACK_APP_TOKEN

  if (!token) {
    console.log('⚠️  Set SLACK_TOKEN and SLACK_APP_TOKEN environment variables')
    console.log('   export SLACK_TOKEN=xoxb-...')
    console.log('   export SLACK_APP_TOKEN=xapp-...')
    console.log('')
    console.log('Running in demo mode with RAMResource instead...\n')
    return runDemo()
  }

  const ws = new Workspace({
    '/slack':   new SlackResource({ token, appToken }),
    '/scratch': new RAMResource(),
  })

  console.log('=== Fold Slack Monitor ===\n')

  // List channels
  console.log('📢 Channels:')
  const channels = await ws.execute('ls -c /slack/channels')
  console.log(channels.stdout)

  // Watch for new messages
  if (appToken) {
    console.log('\n👁️  Watching for new messages (Ctrl+C to stop)...\n')
    ws.watch('/slack/channels', (event) => {
      console.log(`📨 New activity: ${event.path}`)
      if (event.metadata?.text) {
        console.log(`   Message: ${event.metadata.text}`)
      }
    })
    // Keep process alive
    await new Promise(() => {})
  }
}

async function runDemo() {
  const ws = new Workspace({ '/data': new RAMResource() })

  // Simulate Slack-like data
  const messages = [
    { ts: '1715000000', user: 'U001', text: 'Deployed v2.1 to staging' },
    { ts: '1715000100', user: 'U002', text: 'Looks good, running tests' },
    { ts: '1715000200', user: 'U001', text: 'All tests passed ✅' },
  ]

  await ws.execute(`echo '${messages.map(m => JSON.stringify(m)).join('\\n')}' > /data/messages.jsonl`)

  console.log('📨 Simulated messages:')
  const result = await ws.execute('cat /data/messages.jsonl')
  console.log(result.stdout)

  console.log('\n🔍 Searching for deployments:')
  const grep = await ws.execute('grep deploy /data/messages.jsonl')
  console.log(grep.stdout || '  (no matches)')

  console.log('\n✅ Demo complete!')
}

main().catch(console.error)
