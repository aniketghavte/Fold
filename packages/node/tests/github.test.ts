// packages/node/tests/github.test.ts
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'
import { GitHubResource } from '../src/resources/github'

const mockFetch = vi.fn()

describe('GitHubResource', () => {
  let resource: GitHubResource
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = mockFetch as unknown as typeof fetch
    resource = new GitHubResource({ owner: 'testowner', repo: 'testrepo', token: 'test-token' })
    mockFetch.mockReset()
  })

  afterEach(() => { globalThis.fetch = originalFetch })

  test('list root with default owner/repo', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ name: 'README.md', type: 'file', size: 1234 }, { name: 'src', type: 'dir' }] })
    const entries = await resource.list('/')
    expect(entries).toHaveLength(2)
    expect(entries[0].type).toBe('file')
    expect(entries[1].type).toBe('directory')
  })

  test('list without owner/repo returns user repos', async () => {
    const r2 = new GitHubResource({})
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ full_name: 'user/repo1', name: 'repo1' }] })
    const entries = await r2.list('/')
    expect(entries[0].name).toBe('user/repo1')
  })

  test('read file returns decoded content', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ content: Buffer.from('Hello').toString('base64'), encoding: 'base64' }) })
    expect((await resource.read('/README.md')).toString()).toBe('Hello')
  })

  test('read throws on missing content', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    await expect(resource.read('/empty.txt')).rejects.toThrow('No content')
  })

  test('API error throws', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' })
    await expect(resource.read('/nonexistent.txt')).rejects.toThrow('GitHub API error: 404')
  })

  test('write throws read-only', async () => {
    await expect(resource.write('/t', Buffer.from('x'))).rejects.toThrow('read-only')
  })

  test('delete throws read-only', async () => {
    await expect(resource.delete('/t')).rejects.toThrow('read-only')
  })

  test('stat returns exists=true for valid file', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ content: 'eA==', encoding: 'base64' }) })
    expect((await resource.stat('/f.txt')).exists).toBe(true)
  })

  test('stat returns exists=false on error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' })
    expect((await resource.stat('/nope')).exists).toBe(false)
  })

  test('listWithContext returns meta', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ name: 'index.ts', type: 'file', size: 100 }] })
    const entries = await resource.listWithContext('/')
    expect(entries[0].meta?.language).toBe('TypeScript')
  })

  test('includes auth header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] })
    await resource.list('/')
    expect(mockFetch.mock.calls[0][1].headers['Authorization']).toBe('Bearer test-token')
  })
})
