// packages/core/src/index.ts
// Barrel exports for @fold/core

// ---- Resource interface & types ----
export type { EntryType, Entry, FileStat, WriteOptions, ResourceEvent } from './resource'
export type { Resource, ReactiveResource, ContextualResource } from './resource'
export { isReactive, isContextual } from './resource'

// ---- Rich context ----
export type { ContextEntry } from './context'

// ---- Workspace ----
export { Workspace } from './workspace'
export type { WorkspaceConfig, ExecuteResult, WatchHandler, CommandContext } from './workspace'

// ---- Cache ----
export type { CacheStore } from './cache'
export { RAMCacheStore } from './cache'

// ---- Reactive Engine ----
export { ReactiveEngine } from './reactive'
export type { WatchCallback, WatchOptions } from './reactive'

// ---- Executor ----
export type { CommandHandler } from './executor'
