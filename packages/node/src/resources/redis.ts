// packages/node/src/resources/redis.ts
// RedisResource — Redis keys as files, key prefixes as directories.
// Requires: npm install ioredis

import type { Resource, Entry, FileStat, WriteOptions, ContextualResource } from '@fold/core'

export interface RedisConfig {
  url?: string
  prefix?: string
}

export class RedisResource implements Resource, ContextualResource {
  private client: import('ioredis').Redis | null = null
  private prefix: string
  private url: string

  constructor(config: RedisConfig = {}) {
    this.url = config.url ?? 'redis://localhost:6379'
    this.prefix = config.prefix ?? ''
  }

  private async getClient(): Promise<import('ioredis').Redis> {
    if (!this.client) {
      const Redis = (await import('ioredis')).default
      this.client = new Redis(this.url)
    }
    return this.client
  }

  private key(vfsPath: string): string {
    return this.prefix + vfsPath.replace(/^\//, '')
  }

  async list(vfsPath: string): Promise<Entry[]> {
    const client = await this.getClient()
    const pattern = this.key(vfsPath) + (vfsPath.endsWith('/') || vfsPath === '/' ? '*' : '/*')
    const keys = await client.keys(pattern)
    const baseLen = this.key(vfsPath).replace(/\/$/, '').length + 1
    const seen = new Set<string>()
    const entries: Entry[] = []
    for (const key of keys) {
      const relative = key.slice(baseLen)
      const name = relative.split('/')[0]
      if (seen.has(name)) continue
      seen.add(name)
      const isDir = relative.includes('/')
      entries.push({ name, path: `${vfsPath === '/' ? '' : vfsPath}/${name}`, type: isDir ? 'directory' : 'file' })
    }
    return entries
  }

  async listWithContext(vfsPath: string): Promise<import('@fold/core').ContextEntry[]> {
    const entries = await this.list(vfsPath)
    if (entries.length === 0) return []

    const client = await this.getClient()
    const pipeline = client.pipeline()
    const fileEntries = entries.filter(e => e.type === 'file')
    
    for (const entry of fileEntries) {
      const redisKey = this.key(entry.path)
      pipeline.type(redisKey)
      pipeline.ttl(redisKey)
    }

    const results = await pipeline.exec()
    let resultIdx = 0

    return entries.map(entry => {
      const meta: Record<string, unknown> = {}
      if (entry.type === 'file' && results) {
        const typeRes = results[resultIdx * 2]?.[1] as string
        const ttlRes = results[resultIdx * 2 + 1]?.[1] as number
        resultIdx++
        
        meta.redisType = typeRes
        meta.ttl = ttlRes
        meta.summary = `Type: ${typeRes} | TTL: ${ttlRes < 0 ? 'infinite' : ttlRes + 's'}`
      } else {
        meta.summary = 'Key Prefix'
      }
      return { ...entry, meta }
    })
  }

  async read(vfsPath: string): Promise<Buffer> {
    const client = await this.getClient()
    const val = await client.get(this.key(vfsPath))
    if (val === null) throw new Error(`Key not found: ${vfsPath}`)
    return Buffer.from(val)
  }

  async write(vfsPath: string, data: Buffer, options?: WriteOptions): Promise<void> {
    const client = await this.getClient()
    if (options?.append) {
      await client.append(this.key(vfsPath), data.toString())
    } else {
      await client.set(this.key(vfsPath), data.toString())
    }
  }

  async stat(vfsPath: string): Promise<FileStat> {
    const client = await this.getClient()
    const exists = await client.exists(this.key(vfsPath))
    return { type: 'file', exists: exists === 1 }
  }

  async delete(vfsPath: string): Promise<void> {
    const client = await this.getClient()
    await client.del(this.key(vfsPath))
  }
}
