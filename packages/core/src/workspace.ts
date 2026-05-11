// packages/core/src/workspace.ts
// The Workspace is the main class developers interact with.
// It's the unified tree that mounts resources at path prefixes.

import type { Resource, Entry, ResourceEvent } from './resource'
import { isReactive, isContextual } from './resource'
import type { ContextEntry } from './context'
import { Executor, type CommandHandler } from './executor'
import { type CacheStore, RAMCacheStore } from './cache'
import { ReactiveEngine } from './reactive'

/**
 * Configuration for creating a Workspace.
 */
export interface WorkspaceConfig {
  /** Custom cache implementation (default: RAMCacheStore) */
  cache?: CacheStore
  /** TTL for cached index/file data in seconds (default: 300) */
  indexTTL?: number
}

/**
 * Result of executing a command.
 */
export interface ExecuteResult {
  /** Standard output */
  stdout: string
  /** Standard error */
  stderr: string
  /** Exit code (0 = success) */
  exitCode: number
}

/**
 * Handler for watch events.
 */
export interface WatchHandler {
  (event: ResourceEvent): void | Promise<void>
}

/**
 * Context passed to command handlers.
 */
export interface CommandContext {
  /** Reference to the workspace for file operations */
  workspace: Workspace
  /** Piped input from previous command in pipeline */
  stdin?: Buffer
  /** Environment variables */
  env?: Record<string, string>
}

/**
 * The Workspace — Fold's central abstraction.
 *
 * Mount any number of resources at path prefixes, then interact with them
 * using familiar filesystem semantics: cat, ls, cp, grep, pipes.
 *
 * @example
 * ```ts
 * const ws = new Workspace({
 *   '/notes':  new LocalFSResource({ path: '~/Documents' }),
 *   '/db':     new SQLiteResource({ path: './local.db' }),
 *   '/s3':     new S3Resource({ bucket: 'my-bucket' }),
 * })
 *
 * await ws.execute('grep -rn "payment bug" /notes/')
 * await ws.execute('cp /s3/report.csv /notes/reports/may.csv')
 * ```
 */
export class Workspace {
  private mounts: Map<string, Resource> = new Map()
  private executor: Executor
  private reactive: ReactiveEngine
  private cache: CacheStore
  private indexTTL: number

  constructor(mounts: Record<string, Resource>, config: WorkspaceConfig = {}) {
    // Populate mount table
    for (const [prefix, resource] of Object.entries(mounts)) {
      this.mounts.set(prefix, resource)
    }
    this.cache = config.cache ?? new RAMCacheStore()
    this.indexTTL = config.indexTTL ?? 300
    this.executor = new Executor(this)
    this.reactive = new ReactiveEngine()
  }

  // ================================================================
  // Path Routing — longest prefix match
  // ================================================================

  /**
   * Resolve a VFS path to a resource + relative path.
   * Uses longest-prefix matching against the mount table.
   */
  resolve(vfsPath: string): { resource: Resource; relativePath: string; mountPrefix: string } | null {
    let bestMatch = ''
    for (const prefix of this.mounts.keys()) {
      if (vfsPath.startsWith(prefix) && prefix.length > bestMatch.length) {
        bestMatch = prefix
      }
    }
    if (!bestMatch) return null
    const resource = this.mounts.get(bestMatch)!
    const relativePath = vfsPath.slice(bestMatch.length) || '/'
    return { resource, relativePath, mountPrefix: bestMatch }
  }

  // ================================================================
  // Command Execution
  // ================================================================

  /**
   * Execute a bash-like command string.
   * Supports pipes, output redirection, and all built-in commands.
   */
  async execute(command: string): Promise<ExecuteResult> {
    return this.executor.run(command.trim())
  }

  // ================================================================
  // Listings
  // ================================================================

  /**
   * List entries at a VFS path. Results are cached.
   */
  async list(vfsPath: string): Promise<Entry[]> {
    const cacheKey = `index:${vfsPath}`
    const cached = await this.cache.get(cacheKey)
    if (cached) return JSON.parse(cached)

    const match = this.resolve(vfsPath)
    if (!match) throw new Error(`No resource mounted at: ${vfsPath}`)
    const entries = await match.resource.list(match.relativePath)

    await this.cache.set(cacheKey, JSON.stringify(entries), this.indexTTL)
    return entries
  }

  /**
   * List entries with rich context metadata (for LLM-aware agents).
   * Falls back to regular list if the resource doesn't support context.
   */
  async listWithContext(vfsPath: string): Promise<ContextEntry[]> {
    const match = this.resolve(vfsPath)
    if (!match) throw new Error(`No resource mounted at: ${vfsPath}`)
    if (isContextual(match.resource)) {
      return match.resource.listWithContext(match.relativePath)
    }
    // Fallback: return regular listing as ContextEntry
    return match.resource.list(match.relativePath)
  }

  // ================================================================
  // Reactive — ws.watch()
  // ================================================================

  /**
   * Watch a VFS path for changes. The handler fires when the resource
   * emits events (file created, modified, deleted).
   *
   * @returns An unsubscribe function.
   *
   * @example
   * ```ts
   * const unwatch = ws.watch('/slack/channels/incident', async (event) => {
   *   const summary = await ws.execute(`cat ${event.path}`)
   *   await agent.run(summary.stdout)
   * })
   *
   * // Stop watching
   * unwatch()
   * ```
   */
  watch(vfsPath: string, handler: WatchHandler): () => void {
    const match = this.resolve(vfsPath)
    if (!match) throw new Error(`No resource mounted at: ${vfsPath}`)
    if (!isReactive(match.resource)) {
      throw new Error(`Resource at ${vfsPath} does not support watching`)
    }
    return match.resource.subscribe(match.relativePath, handler)
  }

  // ================================================================
  // Custom Commands
  // ================================================================

  /**
   * Register a custom command available in execute().
   */
  command(
    name: string,
    handler: CommandHandler,
    options?: { resource?: string; filetype?: string }
  ): void {
    this.executor.registerCommand(name, handler, options)
  }

  // ================================================================
  // File Operations (used internally by executor)
  // ================================================================

  /**
   * Read a file from the VFS. Results are cached.
   */
  async readFile(vfsPath: string): Promise<Buffer> {
    const cacheKey = `file:${vfsPath}`
    const cached = await this.cache.getBuffer(cacheKey)
    if (cached) return cached

    const match = this.resolve(vfsPath)
    if (!match) throw new Error(`No resource mounted at: ${vfsPath}`)
    const data = await match.resource.read(match.relativePath)

    await this.cache.setBuffer(cacheKey, data, this.indexTTL)
    return data
  }

  /**
   * Write a file to the VFS. Invalidates cache for that path.
   */
  async writeFile(vfsPath: string, data: Buffer): Promise<void> {
    const match = this.resolve(vfsPath)
    if (!match) throw new Error(`No resource mounted at: ${vfsPath}`)
    await match.resource.write(match.relativePath, data)
    await this.cache.delete(`file:${vfsPath}`)
    await this.cache.delete(`index:${vfsPath.split('/').slice(0, -1).join('/')}`)
  }

  /**
   * Get the mount table (for introspection/testing).
   */
  getMounts(): Map<string, Resource> {
    return this.mounts
  }

  // ================================================================
  // Snapshot / Restore (TODO — Phase 2)
  // ================================================================

  async snapshot(_outputPath: string): Promise<void> {
    throw new Error('TODO: implement snapshot — Phase 2')
  }

  static async load(_snapshotPath: string): Promise<Workspace> {
    throw new Error('TODO: implement load — Phase 2')
  }
}
