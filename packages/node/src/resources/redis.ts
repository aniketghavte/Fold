// packages/node/src/resources/redis.ts
// RedisResource — Redis keys as files, key prefixes as directories.
// Requires: npm install ioredis

import type { Resource, Entry, FileStat, WriteOptions } from '@fold/core'

export interface RedisConfig {
  url?: string
  prefix?: string
}

export class RedisResource implements Resource {
  private client: import('ioredis').Redis
  private prefix: string

  constructor(config: RedisConfig = {}) {
    const Redis = require('ioredis') as typeof import('ioredis').default
    this.client = new Redis(config.url ?? 'redis://localhost:6379')
    this.prefix = config.prefix ?? ''
  }

  private key(vfsPath: string): string {
    return this.prefix + vfsPath.replace(/^\//, '')
  }

  async list(vfsPath: string): Promise<Entry[]> {
    const pattern = this.key(vfsPath) + (vfsPath.endsWith('/') || vfsPath === '/' ? '*' : '/*')
    const keys = await this.client.keys(pattern)
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

  async read(vfsPath: string): Promise<Buffer> {
    const val = await this.client.get(this.key(vfsPath))
    if (val === null) throw new Error(`Key not found: ${vfsPath}`)
    return Buffer.from(val)
  }

  async write(vfsPath: string, data: Buffer, options?: WriteOptions): Promise<void> {
    if (options?.append) {
      await this.client.append(this.key(vfsPath), data.toString())
    } else {
      await this.client.set(this.key(vfsPath), data.toString())
    }
  }

  async stat(vfsPath: string): Promise<FileStat> {
    const exists = await this.client.exists(this.key(vfsPath))
    return { type: 'file', exists: exists === 1 }
  }

  async delete(vfsPath: string): Promise<void> {
    await this.client.del(this.key(vfsPath))
  }
}
