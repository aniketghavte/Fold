// packages/core/tests/workspace.test.ts
import { describe, test, expect, beforeEach } from 'vitest'
import { Workspace } from '../src/workspace'
import type { Resource, Entry, FileStat, WriteOptions, ResourceEvent, ReactiveResource } from '../src/resource'

class TestResource implements Resource, ReactiveResource {
  private files: Map<string, Buffer> = new Map()
  private watchers: Map<string, Set<(e: ResourceEvent) => void>> = new Map()

  async list(path: string): Promise<Entry[]> {
    const prefix = path === '/' ? '' : path
    const entries: Entry[] = []
    const seen = new Set<string>()
    for (const key of this.files.keys()) {
      if (prefix && !key.startsWith(prefix + '/')) continue
      const rel = prefix ? key.slice(prefix.length + 1) : key.slice(1)
      const name = rel.split('/')[0]
      if (seen.has(name)) continue
      seen.add(name)
      entries.push({ name, path: `${prefix}/${name}`, type: rel.includes('/') ? 'directory' : 'file' })
    }
    return entries
  }
  async read(path: string): Promise<Buffer> {
    const d = this.files.get(path)
    if (!d) throw new Error(`Not found: ${path}`)
    return d
  }
  async write(path: string, data: Buffer, opts?: WriteOptions): Promise<void> {
    const isNew = !this.files.has(path)
    if (opts?.append && this.files.has(path)) {
      this.files.set(path, Buffer.concat([this.files.get(path)!, data]))
    } else { this.files.set(path, data) }
    this.emit(path, isNew ? 'created' : 'modified')
  }
  async stat(path: string): Promise<FileStat> {
    return { type: 'file', exists: this.files.has(path) }
  }
  async delete(path: string): Promise<void> {
    this.files.delete(path); this.emit(path, 'deleted')
  }
  subscribe(path: string, handler: (e: ResourceEvent) => void): () => void {
    if (!this.watchers.has(path)) this.watchers.set(path, new Set())
    this.watchers.get(path)!.add(handler)
    return () => this.watchers.get(path)?.delete(handler)
  }
  private emit(path: string, type: ResourceEvent['type']): void {
    const ev: ResourceEvent = { type, path, resource: 'test', timestamp: new Date() }
    for (const [wp, hs] of this.watchers) { if (path.startsWith(wp)) hs.forEach(h => h(ev)) }
  }
}

describe('Workspace', () => {
  let ws: Workspace
  beforeEach(() => { ws = new Workspace({ '/data': new TestResource(), '/other': new TestResource() }) })

  test('resolve finds correct resource', () => {
    const m = ws.resolve('/data/file.txt')
    expect(m).not.toBeNull()
    expect(m!.mountPrefix).toBe('/data')
    expect(m!.relativePath).toBe('/file.txt')
  })
  test('resolve picks longest prefix', () => {
    const ws2 = new Workspace({ '/a': new TestResource(), '/a/b': new TestResource() })
    expect(ws2.resolve('/a/b/c.txt')!.mountPrefix).toBe('/a/b')
  })
  test('resolve returns null for unmatched', () => { expect(ws.resolve('/nope')).toBeNull() })
  test('writeFile and readFile roundtrip', async () => {
    await ws.writeFile('/data/hello.txt', Buffer.from('hello'))
    expect((await ws.readFile('/data/hello.txt')).toString()).toBe('hello')
  })
  test('execute cat', async () => {
    await ws.writeFile('/data/f.txt', Buffer.from('content'))
    const r = await ws.execute('cat /data/f.txt')
    expect(r.stdout).toBe('content')
    expect(r.exitCode).toBe(0)
  })

  test('list / returns virtual directories for top-level mounts', async () => {
    const ws = new Workspace({
      '/data': new TestResource(),
      '/docs/tech': new TestResource(),
      '/data/logs': new TestResource(),
    })
    const entries = await ws.list('/')
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.name).sort()).toEqual(['data', 'docs'])
    expect(entries[0].type).toBe('directory')
  })

  test('execute unknown command', async () => {
    const r = await ws.execute('nope')
    expect(r.exitCode).toBe(1)
  })
  test('watch fires on write', async () => {
    const evts: ResourceEvent[] = []
    ws.watch('/data', e => evts.push(e))
    await ws.writeFile('/data/new.txt', Buffer.from('hi'))
    expect(evts.length).toBeGreaterThanOrEqual(1)
  })
  test('watch unsubscribe works', async () => {
    const evts: ResourceEvent[] = []
    const unsub = ws.watch('/data', e => evts.push(e))
    await ws.writeFile('/data/a.txt', Buffer.from('a'))
    unsub()
    await ws.writeFile('/data/b.txt', Buffer.from('b'))
    expect(evts).toHaveLength(1)
  })
  test('custom command', async () => {
    ws.command('greet', async (args) => `Hello, ${args[0]}!`)
    const r = await ws.execute('greet Fold')
    expect(r.stdout).toBe('Hello, Fold!')
  })
})
