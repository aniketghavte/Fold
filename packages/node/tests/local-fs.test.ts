// packages/node/tests/local-fs.test.ts
// Tests for LocalFSResource — real filesystem operations against temp directory

import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { LocalFSResource } from '../src/resources/local-fs'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

describe('LocalFSResource', () => {
  let tmpDir: string
  let resource: LocalFSResource

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fold-test-'))
    resource = new LocalFSResource({ path: tmpDir })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ---- Read / Write ----

  test('write and read a file', async () => {
    await resource.write('/hello.txt', Buffer.from('hello world'))
    const data = await resource.read('/hello.txt')
    expect(data.toString()).toBe('hello world')
  })

  test('write creates nested directories', async () => {
    await resource.write('/deep/nested/file.txt', Buffer.from('content'))
    const data = await resource.read('/deep/nested/file.txt')
    expect(data.toString()).toBe('content')
  })

  test('append mode works', async () => {
    await resource.write('/log.txt', Buffer.from('line1\n'))
    await resource.write('/log.txt', Buffer.from('line2\n'), { append: true })
    const data = await resource.read('/log.txt')
    expect(data.toString()).toBe('line1\nline2\n')
  })

  // ---- Listing ----

  test('list returns directory entries', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.txt'), 'a')
    await fs.writeFile(path.join(tmpDir, 'b.txt'), 'b')
    await fs.mkdir(path.join(tmpDir, 'subdir'))

    const entries = await resource.list('/')
    expect(entries.length).toBe(3)
    const names = entries.map(e => e.name).sort()
    expect(names).toEqual(['a.txt', 'b.txt', 'subdir'])
  })

  test('list returns correct types', async () => {
    await fs.writeFile(path.join(tmpDir, 'file.txt'), 'data')
    await fs.mkdir(path.join(tmpDir, 'dir'))

    const entries = await resource.list('/')
    const file = entries.find(e => e.name === 'file.txt')
    const dir = entries.find(e => e.name === 'dir')
    expect(file?.type).toBe('file')
    expect(dir?.type).toBe('directory')
  })

  // ---- Rich Context ----

  test('listWithContext includes file size and modification time', async () => {
    await fs.writeFile(path.join(tmpDir, 'data.txt'), 'hello world')

    const entries = await resource.listWithContext('/')
    const file = entries.find(e => e.name === 'data.txt')
    expect(file?.size).toBe(11)
    expect(file?.modifiedAt).toBeInstanceOf(Date)
  })

  test('listWithContext detects language from extension', async () => {
    await fs.writeFile(path.join(tmpDir, 'app.ts'), 'const x = 1')

    const entries = await resource.listWithContext('/')
    const file = entries.find(e => e.name === 'app.ts')
    expect(file?.meta?.language).toBe('TypeScript')
  })

  test('listWithContext reads CSV schema', async () => {
    await fs.writeFile(path.join(tmpDir, 'data.csv'), 'name,age,city\nAlice,30,NYC')

    const entries = await resource.listWithContext('/')
    const file = entries.find(e => e.name === 'data.csv')
    expect(file?.meta?.schema).toEqual(['name', 'age', 'city'])
  })

  test('listWithContext includes itemCount for directories', async () => {
    await fs.mkdir(path.join(tmpDir, 'mydir'))
    await fs.writeFile(path.join(tmpDir, 'mydir', 'a.txt'), 'a')
    await fs.writeFile(path.join(tmpDir, 'mydir', 'b.txt'), 'b')

    const entries = await resource.listWithContext('/')
    const dir = entries.find(e => e.name === 'mydir')
    expect(dir?.meta?.itemCount).toBe(2)
  })

  // ---- Stat ----

  test('stat returns exists=true for existing file', async () => {
    await fs.writeFile(path.join(tmpDir, 'file.txt'), 'data')
    const stat = await resource.stat('/file.txt')
    expect(stat.exists).toBe(true)
    expect(stat.type).toBe('file')
    expect(stat.size).toBe(4)
  })

  test('stat returns exists=false for missing file', async () => {
    const stat = await resource.stat('/missing.txt')
    expect(stat.exists).toBe(false)
  })

  // ---- Delete ----

  test('delete removes a file', async () => {
    await fs.writeFile(path.join(tmpDir, 'temp.txt'), 'temp')
    await resource.delete('/temp.txt')
    const stat = await resource.stat('/temp.txt')
    expect(stat.exists).toBe(false)
  })

  test('delete removes a directory recursively', async () => {
    await fs.mkdir(path.join(tmpDir, 'dir'))
    await fs.writeFile(path.join(tmpDir, 'dir', 'file.txt'), 'data')
    await resource.delete('/dir')
    const stat = await resource.stat('/dir')
    expect(stat.exists).toBe(false)
  })

  // ---- Read-only mode ----

  test('readonly mode blocks writes', async () => {
    const ro = new LocalFSResource({ path: tmpDir, readonly: true })
    await expect(ro.write('/test.txt', Buffer.from('data'))).rejects.toThrow('read-only')
  })

  test('readonly mode blocks deletes', async () => {
    await fs.writeFile(path.join(tmpDir, 'file.txt'), 'data')
    const ro = new LocalFSResource({ path: tmpDir, readonly: true })
    await expect(ro.delete('/file.txt')).rejects.toThrow('read-only')
  })

  // ---- Path traversal protection ----

  test('blocks path traversal attempts', () => {
    expect(() => {
      // Access private method via type assertion for testing
      const res = resource as unknown as { resolveAbsolute: (p: string) => string }
      res.resolveAbsolute('/../../../etc/passwd')
    }).toThrow('Path traversal blocked')
  })
})
