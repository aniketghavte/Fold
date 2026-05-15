# Fold Virtual Filesystem Documentation

Fold is a runtime-agnostic virtual filesystem designed specifically for AI agents. It maps disparate data sources (local files, databases, SaaS APIs, LLMs) into a unified tree of directories and files.

## Architecture

The system is built on a layered architecture:

1. **Resources (`@fold/core`)**: The foundational interface. Every backend implements `list`, `read`, `write`, `stat`, and `delete`.
2. **Workspace (`@fold/core`)**: The central orchestrator. It mounts resources at path prefixes (e.g., `/data`, `/slack`) and handles path resolution using longest-prefix matching.
3. **Executor (`@fold/core`)**: A bash-like command parser and execution engine. It provides built-in commands (`cat`, `ls`, `echo`, `cp`, `grep`, `wc`) and handles pipes natively without spawning child processes.
4. **Node Resources (`@fold/node`)**: Implementations of the Resource interface for Node.js (e.g., LocalFS, SQLite, S3, Slack, GitHub, Ollama, Redis, RAM).
5. **MCP Server (`@fold/mcp`)**: Exposes the Workspace to external clients like Claude or Cursor via the Model Context Protocol.
6. **Agent Adapters (`@fold/agents`)**: Pre-built tools for LangChain, LangGraph, and Vercel AI SDK.

## Key Features

- **Uniformity**: Agents interact with everything using the same bash commands (`ls`, `cat`, `grep`).
- **Safety**: Execution is completely in-process. No shell processes are spawned, providing a strict sandbox.
- **Rich Context (`ls -c`)**: Resources can provide LLM-optimized metadata during listings, saving agents from needing to read multiple files to understand context.
- **Reactive (`ws.watch`)**: Agents can subscribe to changes on the virtual filesystem, enabling push-based workflows (e.g., triggering when a new Slack message arrives).
- **Snapshot/Restore**: The workspace state can be serialized to JSON and loaded later, allowing agents to persist their working memory.

## Getting Started

See the root `README.md` for a quick start guide, or explore the `examples/` directory for specific use cases like the Slack Monitor or Ollama RAG pipeline.
