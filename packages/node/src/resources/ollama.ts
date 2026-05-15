// packages/node/src/resources/ollama.ts
// OllamaResource — treats local LLM as a readable resource.
// Reading a path like /llama3/hello world runs an inference.
// Unique to Fold — no other tool in this space does this.

import type { Resource, Entry, FileStat, ContextualResource, ContextEntry } from '@fold/core'

/**
 * Configuration for OllamaResource.
 */
export interface OllamaConfig {
  /** Ollama server URL (default: http://localhost:11434) */
  baseUrl?: string
  /** Default model if not specified in path */
  model?: string
}

/**
 * OllamaResource — exposes local LLMs as a virtual filesystem.
 *
 * Path structure:
 *   /                       → list available models
 *   /llama3/                → model info + usage hints
 *   /llama3/<prompt>        → run inference (reading = generating)
 *
 * @example
 * ```ts
 * const ws = new Workspace({
 *   '/model': new OllamaResource(),
 * })
 * // List models
 * await ws.execute('ls /model')
 * // Run inference
 * await ws.execute('cat /model/llama3/explain quantum computing')
 * ```
 */
export class OllamaResource implements Resource, ContextualResource {
  private baseUrl: string

  constructor(config: OllamaConfig = {}) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434'
  }

  async list(vfsPath: string): Promise<Entry[]> {
    if (vfsPath === '/' || vfsPath === '') {
      // List available models from Ollama API
      const res = await fetch(`${this.baseUrl}/api/tags`)
      const { models } = await res.json() as { models: { name: string }[] }
      return models.map((m) => ({
        name: m.name,
        path: `/${m.name}`,
        type: 'directory' as const,
      }))
    }
    // Inside a model directory — show usage hint files
    return [
      { name: 'README', path: `${vfsPath}/README`, type: 'file' },
      { name: 'info', path: `${vfsPath}/info`, type: 'file' },
    ]
  }

  async listWithContext(vfsPath: string): Promise<ContextEntry[]> {
    if (vfsPath === '/' || vfsPath === '') {
      const res = await fetch(`${this.baseUrl}/api/tags`)
      const { models } = await res.json() as { models: any[] }
      return models.map((m: any) => ({
        name: m.name,
        path: `/${m.name}`,
        type: 'directory' as const,
        size: m.size,
        modifiedAt: new Date(m.modified_at),
        meta: {
          family: m.details?.family,
          parameterSize: m.details?.parameter_size,
          quantization: m.details?.quantization_level,
          summary: `${m.details?.parameter_size || 'unknown'} params · ${m.details?.quantization_level || 'unknown'}`,
        },
      }))
    }
    return this.list(vfsPath)
  }

  async read(vfsPath: string): Promise<Buffer> {
    const parts = vfsPath.split('/').filter(Boolean)
    const model = parts[0]

    if (parts[1] === 'README') {
      return Buffer.from(`Model: ${model}\nUsage: cat /model/${model}/<your prompt>`)
    }

    if (parts[1] === 'info') {
      const res = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model }),
      })
      return Buffer.from(JSON.stringify(await res.json(), null, 2))
    }

    // Everything else — treat the rest of the path as the prompt
    const prompt = parts.slice(1).join(' ')
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
    })
    const { response } = await res.json() as { response: string }
    return Buffer.from(response)
  }

  async write(vfsPath: string, data: Buffer): Promise<void> {
    // Writing to a model path runs inference with the data as prompt
    // Result is discarded — use this for fire-and-forget generation
    const parts = vfsPath.split('/').filter(Boolean)
    const model = parts[0]
    await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: data.toString(), stream: false }),
    })
  }

  async stat(vfsPath: string): Promise<FileStat> {
    return { type: 'file', exists: true }
  }

  async delete(): Promise<void> {
    throw new Error('Cannot delete from OllamaResource')
  }
}
