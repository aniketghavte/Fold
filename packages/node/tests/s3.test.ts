import { describe, test, expect, vi, beforeEach } from 'vitest'
import { S3Resource } from '../src/resources/s3'

// Mock the AWS SDK
const mockSend = vi.fn()
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn(() => ({ send: mockSend })),
    ListObjectsV2Command: vi.fn((args) => args),
    GetObjectCommand: vi.fn((args) => args),
    PutObjectCommand: vi.fn((args) => args),
    HeadObjectCommand: vi.fn((args) => args),
    DeleteObjectCommand: vi.fn((args) => args),
  }
})

describe('S3Resource', () => {
  let s3: S3Resource

  beforeEach(() => {
    vi.clearAllMocks()
    s3 = new S3Resource({ bucket: 'test-bucket', prefix: 'test-prefix/' })
  })

  test('list directory contents', async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [
        { Key: 'test-prefix/dir/file.txt', Size: 123, LastModified: new Date('2026-01-01') }
      ],
      CommonPrefixes: [
        { Prefix: 'test-prefix/dir/subdir/' }
      ]
    })

    const entries = await s3.list('/dir')
    expect(entries).toHaveLength(2)
    expect(entries[0].name).toBe('subdir')
    expect(entries[0].type).toBe('directory')
    expect(entries[1].name).toBe('file.txt')
    expect(entries[1].type).toBe('file')
  })

  test('listWithContext adds metadata', async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [
        { Key: 'test-prefix/dir/file.txt', Size: 1024, LastModified: new Date('2026-01-01') }
      ],
      CommonPrefixes: [
        { Prefix: 'test-prefix/dir/subdir/' }
      ]
    })

    const entries = await s3.listWithContext('/dir')
    expect(entries[0].meta?.summary).toBe('Prefix/Directory')
    expect(entries[1].meta?.summary).toBe('1.0 KB')
    expect(entries[1].meta?.extension).toBe('txt')
  })

  test('read file', async () => {
    mockSend.mockResolvedValueOnce({
      Body: [Buffer.from('hello '), Buffer.from('world')]
    })

    const data = await s3.read('/dir/file.txt')
    expect(data.toString()).toBe('hello world')
  })

  test('write file', async () => {
    mockSend.mockResolvedValueOnce({})
    await s3.write('/dir/file.txt', Buffer.from('data'))
    expect(mockSend).toHaveBeenCalled()
  })

  test('stat existing file', async () => {
    mockSend.mockResolvedValueOnce({
      ContentLength: 100,
      LastModified: new Date('2026-01-01')
    })
    const stat = await s3.stat('/dir/file.txt')
    expect(stat.exists).toBe(true)
    expect(stat.size).toBe(100)
  })

  test('stat non-existing file', async () => {
    mockSend.mockRejectedValueOnce(new Error('NotFound'))
    const stat = await s3.stat('/dir/missing.txt')
    expect(stat.exists).toBe(false)
  })

  test('delete file', async () => {
    mockSend.mockResolvedValueOnce({})
    await s3.delete('/dir/file.txt')
    expect(mockSend).toHaveBeenCalled()
  })
})
