// packages/node/tests/ram.test.ts
// Tests for RAMResource — CRUD operations, directory navigation, reactive events

import { describe, test, expect, beforeEach } from 'vitest'
import { RAMResource } from '../src/resources/ram'
import type { ResourceEvent } from '@fold/core'

describe('RAMResource', () => {
  let ram: RAMResource

  beforeEach(() => {
    ram = new RAMResource()
  })

  // ---- CRUD ----

  test('write and read a file', async () => {
    await ram.write('/hello.txt', Buffer.from('hello world'))
    const data = await ram.read('/hello.txt')
    expect(data.toString()).toBe('hello world')
  })

  test('write creates nested directories automatically', async () => {
    await ram.write('/deep/nested/file.txt', Buffer.from('deep content'))
    const data = await ram.read('/deep/nested/file.txt')
    expect(data.toString()).toBe('deep content')
  })

  test('append mode appends to existing file', async () => {
    await ram.write('/log.txt', Buffer.from('line1\n'))
    await ram.write('/log.txt', Buffer.from('line2\n'), { append: true })
    const data = await ram.read('/log.txt')
    expect(data.toString()).toBe('line1\nline2\n')
  })

  test('overwrite replaces file content', async () => {
    await ram.write('/file.txt', Buffer.from('old'))
    await ram.write('/file.txt', Buffer.from('new'))
    const data = await ram.read('/file.txt')
    expect(data.toString()).toBe('new')
  })

  test('read non-existent file throws', async () => {
    await expect(ram.read('/nope.txt')).rejects.toThrow('Not a file')
  })

  test('delete removes a file', async () => {
    await ram.write('/temp.txt', Buffer.from('temp'))
    await ram.delete('/temp.txt')
    await expect(ram.read('/temp.txt')).rejects.toThrow()
  })

  // ---- Listing ----

  test('list returns files in a directory', async () => {
    await ram.write('/docs/a.txt', Buffer.from('a'))
    await ram.write('/docs/b.txt', Buffer.from('b'))
    const entries = await ram.list('/docs')
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.name).sort()).toEqual(['a.txt', 'b.txt'])
  })

  test('list returns type information', async () => {
    await ram.write('/dir/file.txt', Buffer.from('x'))
    await ram.write('/dir/subdir/inner.txt', Buffer.from('y'))
    const entries = await ram.list('/dir')
    const file = entries.find(e => e.name === 'file.txt')
    const dir = entries.find(e => e.name === 'subdir')
    expect(file?.type).toBe('file')
    expect(dir?.type).toBe('directory')
  })

  test('list on non-existent path returns empty', async () => {
    const entries = await ram.list('/nope')
    expect(entries).toEqual([])
  })

  test('list root after writes', async () => {
    await ram.write('/a.txt', Buffer.from('a'))
    await ram.write('/b/c.txt', Buffer.from('c'))
    const entries = await ram.list('/')
    expect(entries.map(e => e.name).sort()).toEqual(['a.txt', 'b'])
  })

  // ---- Stat ----

  test('stat returns exists=true for existing file', async () => {
    await ram.write('/file.txt', Buffer.from('hello'))
    const stat = await ram.stat('/file.txt')
    expect(stat.exists).toBe(true)
    expect(stat.type).toBe('file')
    expect(stat.size).toBe(5)
  })

  test('stat returns exists=false for missing path', async () => {
    const stat = await ram.stat('/nope.txt')
    expect(stat.exists).toBe(false)
  })

  test('stat returns directory type', async () => {
    await ram.write('/dir/file.txt', Buffer.from('x'))
    const stat = await ram.stat('/dir')
    expect(stat.exists).toBe(true)
    expect(stat.type).toBe('directory')
  })

  // ---- Reactive ----

  test('subscribe fires on write (created)', async () => {
    const events: ResourceEvent[] = []
    ram.subscribe('/', (event) => { events.push(event) })
    await ram.write('/new.txt', Buffer.from('hello'))
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('created')
    expect(events[0].path).toBe('/new.txt')
    expect(events[0].resource).toBe('ram')
  })

  test('subscribe fires on overwrite (modified)', async () => {
    await ram.write('/file.txt', Buffer.from('v1'))
    const events: ResourceEvent[] = []
    ram.subscribe('/', (event) => { events.push(event) })
    await ram.write('/file.txt', Buffer.from('v2'))
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('modified')
  })

  test('subscribe fires on delete', async () => {
    await ram.write('/file.txt', Buffer.from('data'))
    const events: ResourceEvent[] = []
    ram.subscribe('/', (event) => { events.push(event) })
    await ram.delete('/file.txt')
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('deleted')
  })

  test('unsubscribe stops events', async () => {
    const events: ResourceEvent[] = []
    const unsub = ram.subscribe('/', (event) => { events.push(event) })
    await ram.write('/a.txt', Buffer.from('a'))
    unsub()
    await ram.write('/b.txt', Buffer.from('b'))
    expect(events).toHaveLength(1)
  })

  test('subscribe only fires for matching paths', async () => {
    const events: ResourceEvent[] = []
    ram.subscribe('/data', (event) => { events.push(event) })
    await ram.write('/other/file.txt', Buffer.from('x'))
    await ram.write('/data/file.txt', Buffer.from('y'))
    expect(events).toHaveLength(1)
    expect(events[0].path).toBe('/data/file.txt')
  })
})
