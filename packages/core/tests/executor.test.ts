// packages/core/tests/executor.test.ts
import { describe, test, expect, beforeEach } from 'vitest'
import { Workspace } from '../src/workspace'
import type { Resource, Entry, FileStat, WriteOptions, ResourceEvent, ReactiveResource } from '../src/resource'

class MemResource implements Resource, ReactiveResource {
  private files: Map<string, Buffer> = new Map()
  private watchers: Map<string, Set<(e: ResourceEvent) => void>> = new Map()
  async list(path: string): Promise<Entry[]> {
    const prefix = path === '/' ? '' : path
    const entries: Entry[] = []; const seen = new Set<string>()
    for (const key of this.files.keys()) {
      if (prefix && !key.startsWith(prefix + '/')) continue
      const rel = prefix ? key.slice(prefix.length + 1) : key.slice(1)
      const name = rel.split('/')[0]
      if (seen.has(name)) continue; seen.add(name)
      entries.push({ name, path: `${prefix}/${name}`, type: rel.includes('/') ? 'directory' : 'file', size: this.files.get(key)?.length })
    }
    return entries
  }
  async read(p: string): Promise<Buffer> { const d = this.files.get(p); if (!d) throw new Error(`Not found: ${p}`); return d }
  async write(p: string, data: Buffer, opts?: WriteOptions): Promise<void> {
    const isNew = !this.files.has(p)
    if (opts?.append && this.files.has(p)) this.files.set(p, Buffer.concat([this.files.get(p)!, data]))
    else this.files.set(p, data)
    this.emit(p, isNew ? 'created' : 'modified')
  }
  async stat(p: string): Promise<FileStat> { return { type: 'file', exists: this.files.has(p) } }
  async delete(p: string): Promise<void> { this.files.delete(p); this.emit(p, 'deleted') }
  subscribe(p: string, h: (e: ResourceEvent) => void): () => void {
    if (!this.watchers.has(p)) this.watchers.set(p, new Set()); this.watchers.get(p)!.add(h)
    return () => this.watchers.get(p)?.delete(h)
  }
  private emit(p: string, t: ResourceEvent['type']): void {
    const ev: ResourceEvent = { type: t, path: p, resource: 'mem', timestamp: new Date() }
    for (const [wp, hs] of this.watchers) { if (p.startsWith(wp)) hs.forEach(h => h(ev)) }
  }
}

describe('Executor — Built-in Commands', () => {
  let ws: Workspace
  beforeEach(() => { ws = new Workspace({ '/data': new MemResource() }) })

  // ---- cat ----
  test('cat reads file', async () => {
    await ws.writeFile('/data/f.txt', Buffer.from('hello'))
    const r = await ws.execute('cat /data/f.txt')
    expect(r.stdout).toBe('hello')
  })
  test('cat multiple files concatenates', async () => {
    await ws.writeFile('/data/a.txt', Buffer.from('AAA'))
    await ws.writeFile('/data/b.txt', Buffer.from('BBB'))
    const r = await ws.execute('cat /data/a.txt /data/b.txt')
    expect(r.stdout).toBe('AAABBB')
  })

  // ---- echo ----
  test('echo outputs text', async () => {
    const r = await ws.execute('echo hello world')
    expect(r.stdout).toBe('hello world')
  })

  // ---- ls ----
  test('ls lists directory', async () => {
    await ws.writeFile('/data/a.txt', Buffer.from('a'))
    await ws.writeFile('/data/b.txt', Buffer.from('b'))
    const r = await ws.execute('ls /data')
    expect(r.stdout).toContain('a.txt')
    expect(r.stdout).toContain('b.txt')
  })
  test('ls -l shows long format', async () => {
    await ws.writeFile('/data/file.txt', Buffer.from('data'))
    const r = await ws.execute('ls -l /data')
    expect(r.stdout).toContain('file.txt')
  })

  // ---- cp ----
  test('cp copies file', async () => {
    await ws.writeFile('/data/src.txt', Buffer.from('content'))
    await ws.execute('cp /data/src.txt /data/dst.txt')
    const r = await ws.execute('cat /data/dst.txt')
    expect(r.stdout).toBe('content')
  })

  // ---- mv ----
  test('mv moves file', async () => {
    await ws.writeFile('/data/old.txt', Buffer.from('moved'))
    await ws.execute('mv /data/old.txt /data/new.txt')
    const r = await ws.execute('cat /data/new.txt')
    expect(r.stdout).toBe('moved')
  })

  // ---- rm ----
  test('rm deletes file', async () => {
    await ws.writeFile('/data/temp.txt', Buffer.from('bye'))
    await ws.execute('rm /data/temp.txt')
    const r = await ws.execute('cat /data/temp.txt')
    expect(r.exitCode).toBe(1)
  })

  // ---- grep ----
  test('grep filters lines', async () => {
    await ws.writeFile('/data/log.txt', Buffer.from('error: timeout\ninfo: ok\nerror: crash'))
    const r = await ws.execute('grep error /data/log.txt')
    expect(r.stdout).toContain('error: timeout')
    expect(r.stdout).toContain('error: crash')
    expect(r.stdout).not.toContain('info: ok')
  })
  test('grep from stdin via pipe', async () => {
    await ws.writeFile('/data/log.txt', Buffer.from('error: bad\ninfo: good\nerror: worse'))
    const r = await ws.execute('cat /data/log.txt | grep error')
    expect(r.stdout.split('\n').filter(Boolean)).toHaveLength(2)
  })

  // ---- wc ----
  test('wc -l counts lines', async () => {
    await ws.writeFile('/data/lines.txt', Buffer.from('a\nb\nc'))
    const r = await ws.execute('cat /data/lines.txt | wc -l')
    expect(r.stdout.trim()).toBe('3')
  })
  test('wc -w counts words', async () => {
    const r = await ws.execute('echo hello world foo | wc -w')
    expect(r.stdout.trim()).toBe('3')
  })

  // ---- head / tail ----
  test('head returns first N lines', async () => {
    await ws.writeFile('/data/nums.txt', Buffer.from('1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12'))
    const r = await ws.execute('cat /data/nums.txt | head -n 3')
    expect(r.stdout).toBe('1\n2\n3')
  })
  test('tail returns last N lines', async () => {
    await ws.writeFile('/data/nums.txt', Buffer.from('1\n2\n3\n4\n5'))
    const r = await ws.execute('cat /data/nums.txt | tail -n 2')
    expect(r.stdout).toBe('4\n5')
  })

  // ---- jq ----
  test('jq identity returns input', async () => {
    await ws.writeFile('/data/obj.json', Buffer.from('{"name":"fold","v":1}'))
    const r = await ws.execute('cat /data/obj.json | jq .')
    const parsed = JSON.parse(r.stdout)
    expect(parsed.name).toBe('fold')
  })
  test('jq field access', async () => {
    await ws.writeFile('/data/obj.json', Buffer.from('{"name":"fold"}'))
    const r = await ws.execute('cat /data/obj.json | jq .name')
    expect(r.stdout.trim()).toBe('"fold"')
  })

  // ---- pipes ----
  test('multi-stage pipe', async () => {
    await ws.writeFile('/data/log.txt', Buffer.from('error: a\ninfo: b\nerror: c'))
    const r = await ws.execute('grep error /data/log.txt | wc -l')
    expect(r.stdout.trim()).toBe('2')
  })

  // ---- output redirect ----
  test('> redirects output to file', async () => {
    await ws.execute('echo hello fold > /data/out.txt')
    const r = await ws.execute('cat /data/out.txt')
    expect(r.stdout).toBe('hello fold')
  })
  test('>> appends to file', async () => {
    await ws.writeFile('/data/log.txt', Buffer.from('line1\n'))
    await ws.execute('echo line2 >> /data/log.txt')
    const r = await ws.execute('cat /data/log.txt')
    expect(r.stdout).toContain('line1')
    expect(r.stdout).toContain('line2')
  })

  // ---- mkdir ----
  test('mkdir creates directory marker', async () => {
    await ws.execute('mkdir /data/newdir')
    const r = await ws.execute('ls /data')
    expect(r.stdout).toContain('newdir')
  })

  // ---- cross-resource cp ----
  test('cp across resources', async () => {
    const ws2 = new Workspace({ '/a': new MemResource(), '/b': new MemResource() })
    await ws2.writeFile('/a/file.txt', Buffer.from('cross'))
    await ws2.execute('cp /a/file.txt /b/file.txt')
    const r = await ws2.execute('cat /b/file.txt')
    expect(r.stdout).toBe('cross')
  })

  // ---- quoted strings ----
  test('echo handles quoted strings', async () => {
    const r = await ws.execute('echo "hello world"')
    expect(r.stdout).toBe('hello world')
  })

  // ---- error handling ----
  test('unknown command returns exit code 1', async () => {
    const r = await ws.execute('fakecommand arg1')
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain('Command not found')
  })
})
