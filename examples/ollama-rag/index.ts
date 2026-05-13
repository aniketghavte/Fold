// examples/ollama-rag/index.ts
// Example: Use Ollama via Fold for simple RAG-like workflows
//
// Prerequisites:
//   1. Ollama running locally (ollama serve)
//   2. A model pulled (ollama pull llama3.2)
//   3. Run: npx tsx examples/ollama-rag/index.ts

import { Workspace, RAMResource, OllamaResource, LocalFSResource } from '@fold/node'

async function main() {
  console.log('=== Fold Ollama RAG Example ===\n')

  // Check if Ollama is running
  let ollamaAvailable = false
  try {
    const res = await fetch('http://localhost:11434/api/tags')
    ollamaAvailable = res.ok
  } catch {
    // Ollama not running
  }

  if (!ollamaAvailable) {
    console.log('⚠️  Ollama is not running. Start it with: ollama serve')
    console.log('   Then pull a model: ollama pull llama3.2\n')
    console.log('Running in demo mode...\n')
    return runDemo()
  }

  const ws = new Workspace({
    '/model':   new OllamaResource(),
    '/data':    new RAMResource(),
    '/docs':    new LocalFSResource({ path: '.', readonly: true }),
  })

  // 1. List available models
  console.log('🤖 Available models:')
  const models = await ws.execute('ls /model')
  console.log(models.stdout)

  // 2. Read a local file
  console.log('\n📄 Reading README:')
  const readme = await ws.execute('head -n 5 /docs/README.md')
  console.log(readme.stdout)

  // 3. Ask Ollama to summarize (reads = inference!)
  console.log('\n🧠 Asking Ollama to summarize...')
  const summary = await ws.execute('cat /model/llama3.2/summarize this project in one sentence')
  console.log(`Summary: ${summary.stdout}`)

  // 4. Store result in scratch space
  await ws.execute(`echo "${summary.stdout}" > /data/summary.txt`)
  console.log('\n💾 Summary saved to /data/summary.txt')

  console.log('\n✅ Done!')
}

async function runDemo() {
  const ws = new Workspace({ '/data': new RAMResource() })

  // Simulate the workflow without Ollama
  await ws.execute('echo "Project README content here" > /data/readme.txt')
  await ws.execute('echo "AI-generated summary: This project provides a virtual filesystem for AI agents." > /data/summary.txt')

  console.log('📄 Source document:')
  const doc = await ws.execute('cat /data/readme.txt')
  console.log(`  ${doc.stdout}`)

  console.log('\n🧠 Simulated AI summary:')
  const summary = await ws.execute('cat /data/summary.txt')
  console.log(`  ${summary.stdout}`)

  console.log('\n🔗 Pipeline: cat + grep + wc:')
  await ws.execute('echo "error: timeout\ninfo: ok\nerror: crash" > /data/log.txt')
  const errors = await ws.execute('grep error /data/log.txt | wc -l')
  console.log(`  ${errors.stdout.trim()} errors found`)

  console.log('\n✅ Demo complete!')
}

main().catch(console.error)
