import { describe, test, expect, vi, beforeEach } from 'vitest'
import { RedisResource } from '../src/resources/redis'

// Mock ioredis
const mockGet = vi.fn()
const mockSet = vi.fn()
const mockAppend = vi.fn()
const mockDel = vi.fn()
const mockExists = vi.fn()
const mockKeys = vi.fn()
const mockPipeline = vi.fn()

const mockRedis = vi.fn(() => ({
  get: mockGet,
  set: mockSet,
  append: mockAppend,
  del: mockDel,
  exists: mockExists,
  keys: mockKeys,
  pipeline: mockPipeline,
}))

vi.mock('ioredis', () => {
  return {
    default: mockRedis
  }
})

describe('RedisResource', () => {
  let redis: RedisResource

  beforeEach(() => {
    vi.clearAllMocks()
    redis = new RedisResource({ prefix: 'test:' })
  })

  test('list directory contents', async () => {
    mockKeys.mockResolvedValueOnce(['test:dir/key1', 'test:dir/subdir/key2'])

    const entries = await redis.list('/dir')
    expect(entries).toHaveLength(2)
    expect(entries[0].name).toBe('key1')
    expect(entries[0].type).toBe('file')
    expect(entries[1].name).toBe('subdir')
    expect(entries[1].type).toBe('directory')
  })

  test('listWithContext adds metadata', async () => {
    mockKeys.mockResolvedValueOnce(['test:dir/key1', 'test:dir/subdir/key2'])
    const mockExec = vi.fn().mockResolvedValueOnce([
      [null, 'string'], // type
      [null, 3600]      // ttl
    ])
    mockPipeline.mockReturnValueOnce({
      type: vi.fn(),
      ttl: vi.fn(),
      exec: mockExec
    })

    const entries = await redis.listWithContext('/dir')
    expect(entries[0].meta?.redisType).toBe('string')
    expect(entries[0].meta?.ttl).toBe(3600)
    expect(entries[1].meta?.summary).toBe('Key Prefix')
  })

  test('read key', async () => {
    mockGet.mockResolvedValueOnce('data')
    const data = await redis.read('/key1')
    expect(data.toString()).toBe('data')
  })

  test('read missing key throws', async () => {
    mockGet.mockResolvedValueOnce(null)
    await expect(redis.read('/missing')).rejects.toThrow('Key not found')
  })

  test('write key', async () => {
    mockSet.mockResolvedValueOnce('OK')
    await redis.write('/key1', Buffer.from('data'))
    expect(mockSet).toHaveBeenCalledWith('test:key1', 'data')
  })

  test('stat key', async () => {
    mockExists.mockResolvedValueOnce(1)
    const stat = await redis.stat('/key1')
    expect(stat.exists).toBe(true)
  })

  test('delete key', async () => {
    mockDel.mockResolvedValueOnce(1)
    await redis.delete('/key1')
    expect(mockDel).toHaveBeenCalledWith('test:key1')
  })
})
