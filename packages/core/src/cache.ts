// packages/core/src/cache.ts
// Cache layer — keeps frequently accessed data in memory with TTL expiration.
// The workspace uses this to avoid re-reading files and re-listing directories.

/**
 * Abstract cache interface. Implementations can be in-memory (default),
 * Redis-backed (multi-process), or any other key-value store.
 */
export interface CacheStore {
  /** Get a string value by key */
  get(key: string): Promise<string | null>
  /** Set a string value with optional TTL in seconds */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  /** Get a Buffer value by key */
  getBuffer(key: string): Promise<Buffer | null>
  /** Set a Buffer value with optional TTL in seconds */
  setBuffer(key: string, value: Buffer, ttlSeconds?: number): Promise<void>
  /** Delete a cached value */
  delete(key: string): Promise<void>
}

/**
 * In-process RAM cache with TTL expiration.
 * Zero dependencies — this is the default cache used by Workspace.
 */
export class RAMCacheStore implements CacheStore {
  private store: Map<string, { value: string; expiresAt: number }> = new Map()
  private bufferStore: Map<string, { value: Buffer; expiresAt: number }> = new Map()

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key)
    if (!entry || Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  async set(key: string, value: string, ttlSeconds = 300): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    const entry = this.bufferStore.get(key)
    if (!entry || Date.now() > entry.expiresAt) {
      this.bufferStore.delete(key)
      return null
    }
    return entry.value
  }

  async setBuffer(key: string, value: Buffer, ttlSeconds = 300): Promise<void> {
    this.bufferStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
    this.bufferStore.delete(key)
  }
}
