// packages/node/tests/ollama.test.ts
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'
import { OllamaResource } from '../src/resources/ollama'

const mockFetch = vi.fn()

describe('OllamaResource', () => {
  let resource: OllamaResource
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = mockFetch as unknown as typeof fetch
    resource = new OllamaResource({ baseUrl: 'http://localhost:11434' })
    mockFetch.mockReset()
  })

  afterEach(() => { globalThis.fetch = originalFetch })

  test('list root returns available models', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ models: [{ name: 'llama3' }, { name: 'mistral' }] }) })
    const entries = await resource.list('/')
    expect(entries).toHaveLength(2)
    expect(entries[0].name).toBe('llama3')
    expect(entries[0].type).toBe('directory')
  })

  test('list model dir returns README and info', async () => {
    const entries = await resource.list('/llama3')
    expect(entries.map(e => e.name)).toContain('README')
    expect(entries.map(e => e.name)).toContain('info')
  })

  test('read README returns usage hint', async () => {
    const data = await resource.read('/llama3/README')
    expect(data.toString()).toContain('Model: llama3')
    expect(data.toString()).toContain('Usage:')
  })

  test('read info calls show API', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ modelfile: 'FROM llama3', parameters: {} }) })
    const data = await resource.read('/llama3/info')
    const parsed = JSON.parse(data.toString())
    expect(parsed.modelfile).toBe('FROM llama3')
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/show', expect.objectContaining({ method: 'POST' }))
  })

  test('read prompt runs inference', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ response: 'Hello, I am Llama!' }) })
    const data = await resource.read('/llama3/hello world')
    expect(data.toString()).toBe('Hello, I am Llama!')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.model).toBe('llama3')
    expect(body.prompt).toBe('hello world')
  })

  test('write runs fire-and-forget inference', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ response: 'done' }) })
    await resource.write('/llama3', Buffer.from('summarize this'))
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  test('listWithContext returns metadata', async () => {
    mockFetch.mockResolvedValueOnce({ 
      ok: true, 
      json: async () => ({ 
        models: [{ 
          name: 'llama3', 
          size: 4700000000, 
          modified_at: '2023-11-01T12:00:00Z',
          details: { parameter_size: '8B', quantization_level: 'Q4_0' }
        }] 
      }) 
    })
    const entries = await resource.listWithContext('/')
    expect(entries).toHaveLength(1)
    expect(entries[0].meta?.parameterSize).toBe('8B')
    expect(entries[0].meta?.quantization).toBe('Q4_0')
  })

  test('stat returns exists=true', async () => {
    const stat = await resource.stat('/llama3')
    expect(stat.exists).toBe(true)
  })

  test('delete throws error', async () => {
    await expect(resource.delete('/llama3')).rejects.toThrow('Cannot delete')
  })

  test('custom baseUrl is used', async () => {
    const custom = new OllamaResource({ baseUrl: 'http://gpu-server:11434' })
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ models: [] }) })
    await custom.list('/')
    expect(mockFetch.mock.calls[0][0]).toContain('http://gpu-server:11434')
  })
})
