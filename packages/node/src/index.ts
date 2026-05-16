// packages/node/src/index.ts
// Barrel exports for @fold/node
// Re-exports everything from @fold/core plus Node-specific resources.

import fs from 'fs/promises'
import path from 'path'
import { Workspace, registerDeserializer, type SnapshotData } from '@fold/core'
import { RAMResource } from './resources/ram'

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

// ---- Initialization ----
// Register built-in deserializers
registerDeserializer('ram', (data) => RAMResource.deserialize(data))

// ---- Node.js Snapshot Helpers ----
/**
 * Save a workspace snapshot to disk.
 */
export async function saveWorkspace(ws: Workspace, outputPath: string): Promise<void> {
  const data = await ws.snapshot()
  const json = JSON.stringify(data, null, 2)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, json, 'utf-8')
}

/**
 * Load a workspace snapshot from disk.
 */
export async function loadWorkspace(snapshotPath: string, config?: any): Promise<Workspace> {
  const raw = await fs.readFile(snapshotPath, 'utf-8')
  const data: SnapshotData = JSON.parse(raw)
  return Workspace.loadSnapshot(data, config)
}
