// packages/node/src/resources/sqlite.ts
// SQLiteResource — maps VFS paths to SQLite tables and rows.
// Tables are directories, rows (by primary key) are files.
// Requires: npm install better-sqlite3 @types/better-sqlite3

import type {
  Resource,
  Entry,
  FileStat,
  ContextualResource,
} from '@fold/core'
import type { ContextEntry } from '@fold/core'
import type Database from 'better-sqlite3'

/**
 * Configuration for SQLiteResource.
 */
export interface SQLiteConfig {
  /** Path to the SQLite database file */
  path: string
  /** Open in read-only mode (default: false) */
  readonly?: boolean
}

/**
 * SQLiteResource — exposes a SQLite database as a virtual filesystem.
 *
 * VFS path structure:
 *   /                       → list all tables
 *   /users/                 → list rows in the users table (named by PK)
 *   /users/123              → read row 123 as JSON
 *
 * @example
 * ```ts
 * const ws = new Workspace({
 *   '/db': new SQLiteResource({ path: './local.db' }),
 * })
 * await ws.execute('ls -c /db')        // tables with row counts + schema
 * await ws.execute('cat /db/users/42')  // row as JSON
 * ```
 */
export class SQLiteResource implements Resource, ContextualResource {
  private db: Database.Database

  constructor(config: SQLiteConfig) {
    // Dynamic import to keep better-sqlite3 as optional peer dep
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DatabaseConstructor = require('better-sqlite3') as typeof Database
    this.db = new DatabaseConstructor(config.path, { readonly: config.readonly ?? false })
  }

  async list(vfsPath: string): Promise<Entry[]> {
    const parts = vfsPath.split('/').filter(Boolean)

    if (parts.length === 0) {
      // List all tables
      const tables = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[]
      return tables.map(t => ({
        name: t.name,
        path: `/${t.name}`,
        type: 'directory' as const,
      }))
    }

    const [tableName] = parts
    // List row primary keys
    const pkInfo = this.db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as { name: string; pk: number }[]
    const pkCol = pkInfo.find(c => c.pk === 1)?.name ?? 'rowid'
    const rows = this.db
      .prepare(`SELECT ${pkCol} FROM ${tableName} LIMIT 1000`)
      .all() as Record<string, unknown>[]
    return rows.map(r => ({
      name: String(r[pkCol]),
      path: `/${tableName}/${r[pkCol]}`,
      type: 'file' as const,
    }))
  }

  async listWithContext(vfsPath: string): Promise<ContextEntry[]> {
    const parts = vfsPath.split('/').filter(Boolean)
    if (parts.length === 0) {
      const tables = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[]
      return tables.map(t => {
        const count = (
          this.db.prepare(`SELECT COUNT(*) as c FROM ${t.name}`).get() as { c: number }
        ).c
        const cols = (
          this.db.prepare(`PRAGMA table_info(${t.name})`).all() as { name: string }[]
        ).map(c => c.name)
        return {
          name: t.name,
          path: `/${t.name}`,
          type: 'directory' as const,
          meta: {
            rowCount: count,
            schema: cols,
            summary: `${count} rows · ${cols.join(', ')}`,
          },
        }
      })
    }
    return this.list(vfsPath)
  }

  async read(vfsPath: string): Promise<Buffer> {
    const parts = vfsPath.split('/').filter(Boolean)
    const tableName = parts[0]
    const pk = parts[1]
    const pkInfo = this.db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as { name: string; pk: number }[]
    const pkCol = pkInfo.find(c => c.pk === 1)?.name ?? 'rowid'
    const row = this.db
      .prepare(`SELECT * FROM ${tableName} WHERE ${pkCol} = ?`)
      .get(pk)
    if (!row) throw new Error(`Row not found: ${vfsPath}`)
    return Buffer.from(JSON.stringify(row, null, 2))
  }

  async write(vfsPath: string, data: Buffer): Promise<void> {
    const parts = vfsPath.split('/').filter(Boolean)
    const tableName = parts[0]
    const row = JSON.parse(data.toString())
    const cols = Object.keys(row).join(', ')
    const placeholders = Object.keys(row).map(() => '?').join(', ')
    this.db
      .prepare(`INSERT OR REPLACE INTO ${tableName} (${cols}) VALUES (${placeholders})`)
      .run(...Object.values(row))
  }

  async stat(vfsPath: string): Promise<FileStat> {
    const parts = vfsPath.split('/').filter(Boolean)
    if (parts.length === 0) {
      return { type: 'directory', exists: true }
    }
    if (parts.length === 1) {
      // Check if table exists
      const tables = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
        .all(parts[0]) as { name: string }[]
      return { type: 'directory', exists: tables.length > 0 }
    }
    // Check if row exists
    const tableName = parts[0]
    const pk = parts[1]
    const pkInfo = this.db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as { name: string; pk: number }[]
    const pkCol = pkInfo.find(c => c.pk === 1)?.name ?? 'rowid'
    const row = this.db
      .prepare(`SELECT ${pkCol} FROM ${tableName} WHERE ${pkCol} = ?`)
      .get(pk)
    return { type: 'file', exists: !!row }
  }

  async delete(vfsPath: string): Promise<void> {
    const parts = vfsPath.split('/').filter(Boolean)
    const tableName = parts[0]
    const pk = parts[1]
    if (!pk) {
      this.db.prepare(`DROP TABLE ${tableName}`).run()
      return
    }
    const pkInfo = this.db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as { name: string; pk: number }[]
    const pkCol = pkInfo.find(c => c.pk === 1)?.name ?? 'rowid'
    this.db.prepare(`DELETE FROM ${tableName} WHERE ${pkCol} = ?`).run(pk)
  }

  /** Close the database connection */
  close(): void {
    this.db.close()
  }
}
