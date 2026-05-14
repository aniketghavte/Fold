// packages/core/tests/cache.test.ts
// Tests for RAMCacheStore — string/buffer operations, TTL expiration, delete

import { describe, test, expect, beforeEach, vi } from 'vitest'
import { RAMCacheStore } from '../src/cache'

describe('RAMCacheStore', () => {
  let cache: RAMCacheStore

  beforeEach(() => {
    cache = new RAMCacheStore()
  })

  // ---- String operations ----

  test('get returns null for missing key', async () => {
    expect(await cache.get('nope')).toBeNull()
  })

  test('set and get roundtrip', async () => {
    await cache.set('key1', 'value1')
    expect(await cache.get('key1')).toBe('value1')
  })

  test('set overwrites existing value', async () => {
    await cache.set('key', 'v1')
    await cache.set('key', 'v2')
    expect(await cache.get('key')).toBe('v2')
  })

  test('TTL expiration returns null after timeout', async () => {
    vi.useFakeTimers()
    await cache.set('temp', 'data', 1) // 1 second TTL

    // Still valid at 500ms
    vi.advanceTimersByTime(500)
    expect(await cache.get('temp')).toBe('data')

    // Expired after 1500ms
    vi.advanceTimersByTime(1000)
    expect(await cache.get('temp')).toBeNull()

    vi.useRealTimers()
  })

  test('delete removes a cached value', async () => {
    await cache.set('key', 'value')
    await cache.delete('key')
    expect(await cache.get('key')).toBeNull()
  })

  test('delete on non-existent key is a no-op', async () => {
    await cache.delete('nope') // should not throw
  })

  // ---- Buffer operations ----

  test('getBuffer returns null for missing key', async () => {
    expect(await cache.getBuffer('nope')).toBeNull()
  })

  test('setBuffer and getBuffer roundtrip', async () => {
    const data = Buffer.from('binary content')
    await cache.setBuffer('buf1', data)
    const result = await cache.getBuffer('buf1')
    expect(result?.toString()).toBe('binary content')
  })

  test('buffer TTL expiration', async () => {
    vi.useFakeTimers()
    await cache.setBuffer('tbuf', Buffer.from('temp'), 2)

    vi.advanceTimersByTime(1000)
    expect(await cache.getBuffer('tbuf')).not.toBeNull()

    vi.advanceTimersByTime(2000)
    expect(await cache.getBuffer('tbuf')).toBeNull()

    vi.useRealTimers()
  })

  test('delete removes both string and buffer entries', async () => {
    await cache.set('dual', 'string-value')
    await cache.setBuffer('dual', Buffer.from('buffer-value'))
    await cache.delete('dual')
    expect(await cache.get('dual')).toBeNull()
    expect(await cache.getBuffer('dual')).toBeNull()
  })

  // ---- Default TTL ----

  test('default TTL is 300 seconds', async () => {
    vi.useFakeTimers()
    await cache.set('def', 'default-ttl')

    // Still valid at 299 seconds
    vi.advanceTimersByTime(299 * 1000)
    expect(await cache.get('def')).toBe('default-ttl')

    // Expired after 301 seconds
    vi.advanceTimersByTime(2 * 1000)
    expect(await cache.get('def')).toBeNull()

    vi.useRealTimers()
  })

  // ---- Multiple keys ----

  test('independent keys do not interfere', async () => {
    await cache.set('a', '1')
    await cache.set('b', '2')
    await cache.delete('a')
    expect(await cache.get('a')).toBeNull()
    expect(await cache.get('b')).toBe('2')
  })
})
