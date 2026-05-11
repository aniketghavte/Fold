// packages/node/src/resources/local-fs.ts
// LocalFSResource — maps a VFS path to a real directory on the local filesystem.
// This is Fold's primary edge: local-first, privacy-first.

import fs from 'fs/promises'
import fsSync from 'fs'
import nodePath from 'path'
import type {
  Resource,
  Entry,
  FileStat,
  WriteOptions,
  ResourceEvent,
  ReactiveResource,
  ContextualResource,
} from '@fold/core'
import type { ContextEntry } from '@fold/core'

/**
 * Configuration for LocalFSResource.
 */
export interface LocalFSConfig {
  /** Root directory on the actual filesystem */
  path: string
  /** If true, write and delete operations throw (default: false) */
  readonly?: boolean
  /** Guard against reading huge files accidentally */
  maxFileSizeBytes?: number
}

/**
 * LocalFSResource — maps VFS operations to the real local filesystem.
 *
 * Supports reactive subscriptions via `fs.watch`, rich context listings
 * with file metadata, language detection, and CSV schema reading.
 *
 * @example
 * ```ts
 * const ws = new Workspace({
 *   '/notes': new LocalFSResource({ path: '~/Documents' }),
 * })
 * await ws.execute('ls -c /notes/')
 * ```
 */
export class LocalFSResource implements Resource, ReactiveResource, ContextualResource {
  private root: string
  private isReadonly: boolean
  private maxFileSize: number

  constructor(config: LocalFSConfig) {
    // Resolve ~ to home directory
    const expanded = config.path.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '')
    this.root = nodePath.resolve(expanded)
    this.isReadonly = config.readonly ?? false
    this.maxFileSize = config.maxFileSizeBytes ?? 50 * 1024 * 1024 // 50MB default
  }

  /** Resolve a VFS path to an absolute filesystem path with traversal protection */
  private resolveAbsolute(vfsPath: string): string {
    const resolved = nodePath.resolve(this.root, vfsPath.replace(/^\//, ''))
    if (!resolved.startsWith(this.root)) {
      throw new Error(`Path traversal blocked: ${vfsPath}`)
    }
    return resolved
  }

  async list(vfsPath: string): Promise<Entry[]> {
    const abs = this.resolveAbsolute(vfsPath)
    const entries = await fs.readdir(abs, { withFileTypes: true })
    return entries.map(e => ({
      name: e.name,
      path: nodePath.posix.join(vfsPath, e.name),
      type: e.isDirectory() ? 'directory' as const : 'file' as const,
    }))
  }

  async listWithContext(vfsPath: string): Promise<ContextEntry[]> {
    const base = await this.list(vfsPath)
    return Promise.all(
      base.map(async entry => {
        const abs = this.resolveAbsolute(entry.path)
        const stat = await fs.stat(abs)
        const ctx: ContextEntry = {
          ...entry,
          size: stat.size,
          modifiedAt: stat.mtime,
        }

        if (entry.type === 'file') {
          const ext = nodePath.extname(entry.name)
          ctx.meta = { language: extToLanguage(ext) }

          // Read CSV/TSV schema from first line
          if (['.csv', '.tsv'].includes(ext)) {
            try {
              const firstLine = await readFirstLine(abs)
              const separator = ext === '.tsv' ? '\t' : ','
              ctx.meta.schema = firstLine.split(separator).map(s => s.trim())
            } catch {
              // skip if file can't be read
            }
          }
        }

        if (entry.type === 'directory') {
          try {
            const children = await fs.readdir(abs)
            ctx.meta = { itemCount: children.length }
          } catch {
            ctx.meta = { itemCount: 0 }
          }
        }

        return ctx
      })
    )
  }

  async read(vfsPath: string): Promise<Buffer> {
    const abs = this.resolveAbsolute(vfsPath)
    const stat = await fs.stat(abs)
    if (stat.size > this.maxFileSize) {
      throw new Error(
        `File too large (${stat.size} bytes, max ${this.maxFileSize}). ` +
        `Use head/tail to read partial content.`
      )
    }
    return fs.readFile(abs)
  }

  async write(vfsPath: string, data: Buffer, options: WriteOptions = {}): Promise<void> {
    if (this.isReadonly) throw new Error('Resource is read-only')
    const abs = this.resolveAbsolute(vfsPath)
    await fs.mkdir(nodePath.dirname(abs), { recursive: true })
    if (options.append) {
      await fs.appendFile(abs, data)
    } else {
      await fs.writeFile(abs, data)
    }
  }

  async stat(vfsPath: string): Promise<FileStat> {
    try {
      const s = await fs.stat(this.resolveAbsolute(vfsPath))
      return {
        type: s.isDirectory() ? 'directory' : 'file',
        size: s.size,
        modifiedAt: s.mtime,
        createdAt: s.birthtime,
        exists: true,
      }
    } catch {
      return { type: 'file', exists: false }
    }
  }

  async delete(vfsPath: string): Promise<void> {
    if (this.isReadonly) throw new Error('Resource is read-only')
    await fs.rm(this.resolveAbsolute(vfsPath), { recursive: true })
  }

  subscribe(vfsPath: string, handler: (event: ResourceEvent) => void): () => void {
    const abs = this.resolveAbsolute(vfsPath)
    const watcher = fsSync.watch(abs, { recursive: true }, (eventType, filename) => {
      if (!filename) return
      handler({
        type: eventType === 'rename' ? 'created' : 'modified',
        path: nodePath.posix.join(vfsPath, filename),
        resource: 'local-fs',
        timestamp: new Date(),
      })
    })
    return () => watcher.close()
  }
}

// ---- Helpers ----

/** Map file extensions to language names for rich context */
function extToLanguage(ext: string): string | undefined {
  const map: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.py': 'Python',
    '.md': 'Markdown',
    '.json': 'JSON',
    '.csv': 'CSV',
    '.tsv': 'TSV',
    '.sql': 'SQL',
    '.html': 'HTML',
    '.css': 'CSS',
    '.yaml': 'YAML',
    '.yml': 'YAML',
    '.toml': 'TOML',
    '.xml': 'XML',
    '.sh': 'Shell',
    '.bash': 'Shell',
    '.rs': 'Rust',
    '.go': 'Go',
    '.java': 'Java',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.c': 'C',
    '.cpp': 'C++',
    '.h': 'C',
    '.hpp': 'C++',
  }
  return map[ext]
}

/** Read only the first line of a file efficiently */
async function readFirstLine(filePath: string): Promise<string> {
  const buf = Buffer.alloc(4096)
  const fd = await fs.open(filePath, 'r')
  try {
    await fd.read(buf, 0, 4096, 0)
    return buf.toString('utf8').split('\n')[0]
  } finally {
    await fd.close()
  }
}
