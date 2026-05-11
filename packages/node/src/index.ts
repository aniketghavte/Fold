// packages/node/src/index.ts
// Barrel exports for @fold/node
// Re-exports everything from @fold/core plus Node-specific resources.

// ---- Re-export all of core ----
export * from '@fold/core'

// ---- Node.js Resources ----
export { RAMResource } from './resources/ram'
export { LocalFSResource } from './resources/local-fs'
export type { LocalFSConfig } from './resources/local-fs'
