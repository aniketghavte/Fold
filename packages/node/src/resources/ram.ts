// packages/node/src/resources/ram.ts
// In-memory filesystem resource — zero dependencies, fully reactive.
// This is the foundation: build and test everything against RAMResource first.

import type {
  Resource,
  Entry,
  FileStat,
  WriteOptions,
  ResourceEvent,
  ReactiveResource,
  SnapshotableResource,
} from '@fold/core'

/**
 * A node in the in-memory filesystem tree.
 */
interface RAMNode {
  type: 'file' | 'directory'
  data?: Buffer
  children?: Map<string, RAMNode>
  modifiedAt: Date
  createdAt: Date
}

/**
 * RAMResource — a fully in-memory virtual filesystem.
 *
 * Supports both reads/writes and reactive subscriptions.
 * Use this for testing, scratch space, and agent working memory.
 *
 * @example
 * ```ts
 * const ws = new Workspace({ '/scratch': new RAMResource() })
 * await ws.execute('echo "hello" > /scratch/hello.txt')
 * ```
 */
export class RAMResource implements Resource, ReactiveResource, SnapshotableResource {
  private root: RAMNode = {
    type: 'directory',
    children: new Map(),
    modifiedAt: new Date(),
    createdAt: new Date(),
  }

  private watchers: Map<string, Set<(event: ResourceEvent) => void>> = new Map()

  /** Navigate the in-memory tree by path segments. Optionally creates missing directories. */
  private navigate(path: string, create = false): RAMNode | null {
    const parts = path.split('/').filter(Boolean)
    let node = this.root
    for (const part of parts) {
      if (!node.children?.has(part)) {
        if (!create) return null
        const newNode: RAMNode = {
          type: 'directory',
          children: new Map(),
          modifiedAt: new Date(),
          createdAt: new Date(),
        }
        node.children!.set(part, newNode)
      }
      node = node.children!.get(part)!
    }
    return node
  }

  async list(path: string): Promise<Entry[]> {
    const node = this.navigate(path)
    if (!node || node.type !== 'directory') return []
    return Array.from(node.children!.entries()).map(([name, child]) => ({
      name,
      path: `${path === '/' ? '' : path}/${name}`,
      type: child.type,
      size: child.data?.length,
      modifiedAt: child.modifiedAt,
    }))
  }

  async read(path: string): Promise<Buffer> {
    const node = this.navigate(path)
    if (!node || node.type !== 'file') throw new Error(`Not a file: ${path}`)
    return node.data ?? Buffer.alloc(0)
  }

  async write(path: string, data: Buffer, options: WriteOptions = {}): Promise<void> {
    const parts = path.split('/').filter(Boolean)
    const fileName = parts.pop()!
    const dirPath = '/' + parts.join('/')
    const dir = this.navigate(dirPath, true)!
    const existing = dir.children!.get(fileName)
    const isNew = !existing

    if (options.append && existing?.data) {
      dir.children!.set(fileName, {
        type: 'file',
        data: Buffer.concat([existing.data, data]),
        modifiedAt: new Date(),
        createdAt: existing.createdAt,
      })
    } else {
      dir.children!.set(fileName, {
        type: 'file',
        data,
        modifiedAt: new Date(),
        createdAt: existing?.createdAt ?? new Date(),
      })
    }

    this.emit(path, isNew ? 'created' : 'modified')
  }

  async stat(path: string): Promise<FileStat> {
    const node = this.navigate(path)
    if (!node) return { type: 'file', exists: false }
    return {
      type: node.type,
      size: node.data?.length,
      modifiedAt: node.modifiedAt,
      createdAt: node.createdAt,
      exists: true,
    }
  }

  async delete(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean)
    const name = parts.pop()!
    const dir = this.navigate('/' + parts.join('/'))
    dir?.children?.delete(name)
    this.emit(path, 'deleted')
  }

  subscribe(path: string, handler: (event: ResourceEvent) => void): () => void {
    if (!this.watchers.has(path)) this.watchers.set(path, new Set())
    this.watchers.get(path)!.add(handler)
    return () => {
      this.watchers.get(path)?.delete(handler)
    }
  }

  private emit(path: string, type: ResourceEvent['type']): void {
    const event: ResourceEvent = {
      type,
      path,
      resource: 'ram',
      timestamp: new Date(),
    }
    for (const [watchPath, handlers] of this.watchers) {
      if (path.startsWith(watchPath)) {
        handlers.forEach(h => h(event))
      }
    }
  }

  // ================================================================
  // Snapshot / Restore
  // ================================================================

  /** Serialize the entire in-memory tree to a JSON-friendly structure */
  async serialize(): Promise<Record<string, unknown>> {
    return {
      _type: 'ram',
      tree: this.serializeNode(this.root),
    }
  }

  private serializeNode(node: RAMNode): Record<string, unknown> {
    if (node.type === 'file') {
      return {
        type: 'file',
        data: node.data?.toString('base64') ?? '',
        modifiedAt: node.modifiedAt.toISOString(),
        createdAt: node.createdAt.toISOString(),
      }
    }
    const children: Record<string, unknown> = {}
    for (const [name, child] of node.children!) {
      children[name] = this.serializeNode(child)
    }
    return {
      type: 'directory',
      children,
      modifiedAt: node.modifiedAt.toISOString(),
      createdAt: node.createdAt.toISOString(),
    }
  }

  /**
   * Restore a RAMResource from serialized snapshot data.
   *
   * @example
   * ```ts
   * const data = JSON.parse(snapshotJSON)
   * const ram = RAMResource.deserialize(data)
   * ```
   */
  static deserialize(data: Record<string, unknown>): RAMResource {
    const resource = new RAMResource()
    const tree = data.tree as Record<string, unknown>
    resource.root = RAMResource.deserializeNode(tree)
    return resource
  }

  private static deserializeNode(obj: Record<string, unknown>): RAMNode {
    if (obj.type === 'file') {
      return {
        type: 'file',
        data: Buffer.from(obj.data as string, 'base64'),
        modifiedAt: new Date(obj.modifiedAt as string),
        createdAt: new Date(obj.createdAt as string),
      }
    }
    const children = new Map<string, RAMNode>()
    const childrenObj = obj.children as Record<string, Record<string, unknown>>
    for (const [name, childData] of Object.entries(childrenObj)) {
      children.set(name, RAMResource.deserializeNode(childData))
    }
    return {
      type: 'directory',
      children,
      modifiedAt: new Date(obj.modifiedAt as string),
      createdAt: new Date(obj.createdAt as string),
    }
  }
}
