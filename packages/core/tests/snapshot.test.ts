// packages/core/tests/snapshot.test.ts
// Tests for Snapshot/Restore — serialize workspace, write to disk, load back

import { describe, test, expect, afterEach } from 'vitest'
import { Workspace, registerDeserializer } from '../src'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// We need RAMResource from @fold/node for these tests
// Import directly from the sibling package source
import { RAMResource } from '../../node/src/resources/ram'

// Register the RAM deserializer (normally done at app startup)
registerDeserializer('ram', (data) => RAMResource.deserialize(data))

describe('Snapshot/Restore', () => {
  let tmpDir: string

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  })

  async function getTmpDir(): Promise<string> {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fold-snapshot-'))
    return tmpDir
  }

  test('snapshot and load roundtrip with RAMResource', async () => {
    const dir = await getTmpDir()
    const snapshotPath = path.join(dir, 'snapshot.json')

    // Create workspace and write data
    const ws = new Workspace({ '/data': new RAMResource() })
    await ws.writeFile('/data/hello.txt', Buffer.from('hello world'))
    await ws.writeFile('/data/sub/nested.txt', Buffer.from('nested content'))

    // Snapshot
    const snapshotData = await ws.snapshot()
    await fs.writeFile(snapshotPath, JSON.stringify(snapshotData))

    // Verify file was created
    const stat = await fs.stat(snapshotPath)
    expect(stat.size).toBeGreaterThan(0)

    // Load from snapshot
    const ws2 = await Workspace.loadSnapshot(JSON.parse(await fs.readFile(snapshotPath, 'utf-8')))

    // Verify data was restored
    const result1 = await ws2.execute('cat /data/hello.txt')
    expect(result1.stdout).toBe('hello world')

    const result2 = await ws2.execute('cat /data/sub/nested.txt')
    expect(result2.stdout).toBe('nested content')
  })

  test('snapshot preserves directory structure', async () => {
    const dir = await getTmpDir()
    const snapshotPath = path.join(dir, 'snapshot.json')

    const ws = new Workspace({ '/scratch': new RAMResource() })
    await ws.writeFile('/scratch/a.txt', Buffer.from('A'))
    await ws.writeFile('/scratch/b.txt', Buffer.from('B'))
    await ws.writeFile('/scratch/sub/c.txt', Buffer.from('C'))

    const snapshotData = await ws.snapshot()
    await fs.writeFile(snapshotPath, JSON.stringify(snapshotData))
    const ws2 = await Workspace.loadSnapshot(JSON.parse(await fs.readFile(snapshotPath, 'utf-8')))

    const ls = await ws2.execute('ls /scratch')
    expect(ls.stdout).toContain('a.txt')
    expect(ls.stdout).toContain('b.txt')
    expect(ls.stdout).toContain('sub')
  })

  test('snapshot preserves binary data', async () => {
    const dir = await getTmpDir()
    const snapshotPath = path.join(dir, 'snapshot.json')

    const ws = new Workspace({ '/bin': new RAMResource() })
    const binaryData = Buffer.from([0x00, 0xFF, 0x80, 0x42, 0xDE, 0xAD])
    await ws.writeFile('/bin/data.bin', binaryData)

    const snapshotData = await ws.snapshot()
    await fs.writeFile(snapshotPath, JSON.stringify(snapshotData))
    const ws2 = await Workspace.loadSnapshot(JSON.parse(await fs.readFile(snapshotPath, 'utf-8')))

    const restored = await ws2.readFile('/bin/data.bin')
    expect(Buffer.compare(restored, binaryData)).toBe(0)
  })

  test('snapshot with multiple RAM mounts', async () => {
    const dir = await getTmpDir()
    const snapshotPath = path.join(dir, 'snapshot.json')

    const ws = new Workspace({
      '/a': new RAMResource(),
      '/b': new RAMResource(),
    })
    await ws.writeFile('/a/file1.txt', Buffer.from('from A'))
    await ws.writeFile('/b/file2.txt', Buffer.from('from B'))

    const snapshotData = await ws.snapshot()
    await fs.writeFile(snapshotPath, JSON.stringify(snapshotData))
    const ws2 = await Workspace.loadSnapshot(JSON.parse(await fs.readFile(snapshotPath, 'utf-8')))

    expect((await ws2.execute('cat /a/file1.txt')).stdout).toBe('from A')
    expect((await ws2.execute('cat /b/file2.txt')).stdout).toBe('from B')
  })

  test('snapshot JSON has correct structure', async () => {
    const dir = await getTmpDir()
    const snapshotPath = path.join(dir, 'snapshot.json')

    const ws = new Workspace({ '/data': new RAMResource() })
    await ws.writeFile('/data/test.txt', Buffer.from('test'))

    const snapshotData = await ws.snapshot()
    await fs.writeFile(snapshotPath, JSON.stringify(snapshotData))

    const raw = JSON.parse(await fs.readFile(snapshotPath, 'utf-8'))
    expect(raw.version).toBe(1)
    expect(raw.createdAt).toBeDefined()
    expect(raw.mounts).toHaveLength(1)
    expect(raw.mounts[0].prefix).toBe('/data')
    expect(raw.mounts[0].resourceType).toBe('ram')
    expect(raw.mounts[0].snapshotted).toBe(true)
    expect(raw.mounts[0].data).toBeDefined()
  })

  test('load rejects unsupported version', async () => {
    const dir = await getTmpDir()
    const snapshotPath = path.join(dir, 'bad.json')
    await fs.writeFile(snapshotPath, JSON.stringify({ version: 99, mounts: [] }))

    const data = JSON.parse(await fs.readFile(snapshotPath, 'utf-8'))
    await expect(Workspace.loadSnapshot(data)).rejects.toThrow('Unsupported snapshot version')
  })

  test('load rejects invalid object', async () => {
    // @ts-expect-error testing invalid input
    await expect(Workspace.loadSnapshot({})).rejects.toThrow()
  })
})
