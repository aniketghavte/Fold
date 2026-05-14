// packages/core/src/resource.ts
// The foundational contract — every resource in Fold implements this.

/**
 * Type of a VFS entry — either a file or a directory.
 */
export type EntryType = 'file' | 'directory'

/**
 * A single entry in a directory listing.
 */
export interface Entry {
  /** Filename or directory name */
  name: string
  /** Full path including mount prefix */
  path: string
  /** Whether this is a file or directory */
  type: EntryType
  /** Size in bytes, if known */
  size?: number
  /** Last modification time */
  modifiedAt?: Date
}

/**
 * Metadata about a file or directory.
 */
export interface FileStat {
  type: EntryType
  size?: number
  modifiedAt?: Date
  createdAt?: Date
  mimeType?: string
  exists: boolean
}

/**
 * Options for write operations.
 */
export interface WriteOptions {
  /** Whether to overwrite existing file (default: true) */
  overwrite?: boolean
  /** Whether to append instead of replace (default: false) */
  append?: boolean
  /** Content encoding */
  encoding?: 'utf8' | 'binary'
}

/**
 * An event emitted by a reactive resource when data changes.
 */
export interface ResourceEvent {
  /** Type of change */
  type: 'created' | 'modified' | 'deleted'
  /** Full VFS path of the changed item */
  path: string
  /** Name of the resource that fired this event */
  resource: string
  /** When the event occurred */
  timestamp: Date
  /** Arbitrary extra metadata */
  metadata?: Record<string, unknown>
}

/**
 * Base Resource interface — every resource must implement these 5 methods.
 * This is the core contract that makes the VFS work uniformly across
 * local filesystem, S3, Slack, SQLite, Ollama, etc.
 */
export interface Resource {
  /** List entries in a directory */
  list(path: string): Promise<Entry[]>
  /** Read file contents as a Buffer */
  read(path: string): Promise<Buffer>
  /** Write data to a file */
  write(path: string, data: Buffer, options?: WriteOptions): Promise<void>
  /** Get metadata about a file or directory */
  stat(path: string): Promise<FileStat>
  /** Delete a file or directory */
  delete(path: string): Promise<void>
}

/**
 * Optional interface for resources that support push-based change notifications.
 * Enables ws.watch() — the reactive engine.
 */
export interface ReactiveResource extends Resource {
  /**
   * Subscribe to changes at a path.
   * @returns An unsubscribe function.
   */
  subscribe(path: string, handler: (event: ResourceEvent) => void): () => void
}

/**
 * Optional interface for resources that provide rich, LLM-aware listings.
 * Saves agents 3-4 follow-up tool calls by including metadata in `ls -c`.
 */
export interface ContextualResource extends Resource {
  listWithContext(path: string): Promise<import('./context').ContextEntry[]>
}

/**
 * Optional interface for resources that support snapshot/restore.
 * Enables ws.snapshot() — the workspace persistence system.
 */
export interface SnapshotableResource extends Resource {
  /** Serialize the resource's full state to a JSON-friendly object */
  serialize(): Promise<Record<string, unknown>>
}

// ---- Type guard helpers ----

/** Check if a resource supports reactive subscriptions */
export function isReactive(resource: Resource): resource is ReactiveResource {
  return typeof (resource as ReactiveResource).subscribe === 'function'
}

/** Check if a resource supports rich context listings */
export function isContextual(resource: Resource): resource is ContextualResource {
  return typeof (resource as ContextualResource).listWithContext === 'function'
}

/** Check if a resource supports snapshot serialization */
export function isSnapshotable(resource: Resource): resource is SnapshotableResource {
  return typeof (resource as SnapshotableResource).serialize === 'function'
}
