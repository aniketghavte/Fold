# @fold/agents

Agent framework adapters for Fold. Drop your Fold workspace into LangChain, LangGraph, or Vercel AI SDK with one function call.

## Installation

```bash
npm install @fold/agents @fold/node

# Plus the agent framework you use:
npm install @langchain/core    # for LangChain/LangGraph
npm install ai zod             # for Vercel AI SDK
```

## LangChain

```typescript
import { Workspace, RAMResource } from '@fold/node'
import { foldTools } from '@fold/agents'

const ws = new Workspace({ '/data': new RAMResource() })
const tools = foldTools(ws)
// → [DynamicTool { name: 'bash', ... }]
```

## LangGraph

```typescript
import { foldLangGraphTools } from '@fold/agents'

const tools = foldLangGraphTools(workspace)
// Use with createReactAgent or your graph
```

## Vercel AI SDK

```typescript
import { foldTool } from '@fold/agents'
import { generateText } from 'ai'

const tools = foldTool(workspace)
const result = await generateText({
  model: openai('gpt-4o'),
  tools,
  prompt: 'List all files in /data',
})
```

## License

MIT
