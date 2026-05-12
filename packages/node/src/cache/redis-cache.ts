// packages/node/src/cache/redis-cache.ts
// RedisCacheStore — Redis-backed cache for multi-process / serverless.
// Requires: npm install ioredis

import type { CacheStore } from '@fold/core'

export class RedisCacheStore implements CacheStore {
  private client: import('ioredis').Redis

  constructor(url: string = 'redis://localhost:6379') {
    const Redis = require('ioredis') as typeof import('ioredis').default
    this.client = new Redis(url)
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key)
  }

  async set(key: string, value: string, ttlSeconds = 300): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds)
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    return this.client.getBuffer(key)
  }

  async setBuffer(key: string, value: Buffer, ttlSeconds = 300): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds)
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key)
  }
}
