// packages/node/src/index.ts
// Barrel exports for @fold/node
// Re-exports everything from @fold/core plus Node-specific resources.

// ---- Re-export all of core ----
export * from '@fold/core'

// ---- Node.js Resources ----
export { RAMResource } from './resources/ram'
export { LocalFSResource } from './resources/local-fs'
export type { LocalFSConfig } from './resources/local-fs'
export { OllamaResource } from './resources/ollama'
export type { OllamaConfig } from './resources/ollama'
export { SQLiteResource } from './resources/sqlite'
export type { SQLiteConfig } from './resources/sqlite'
export { S3Resource } from './resources/s3'
export type { S3Config } from './resources/s3'
export { SlackResource } from './resources/slack'
export type { SlackConfig } from './resources/slack'
export { GitHubResource } from './resources/github'
export type { GitHubConfig } from './resources/github'
export { RedisResource } from './resources/redis'
export type { RedisConfig } from './resources/redis'

// ---- Cache ----
export { RedisCacheStore } from './cache/redis-cache'
