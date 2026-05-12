// packages/node/tests/sqlite.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// Skip SQLite tests if better-sqlite3 is not installed
let hasSqlite = false
try { require('better-sqlite3'); hasSqlite = true } catch { /* skip */ }

const describeSqlite = hasSqlite ? describe : describe.skip

describeSqlite('SQLiteResource', () => {
  let dbPath: string
  let resource: import('../src/resources/sqlite').SQLiteResource

  beforeEach(async () => {
    const { SQLiteResource } = await import('../src/resources/sqlite')
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fold-sqlite-'))
    dbPath = path.join(tmpDir, 'test.db')
    const Database = require('better-sqlite3')
    const db = new Database(dbPath)
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)')
    db.exec("INSERT INTO users VALUES (1, 'Alice', 30)")
    db.exec("INSERT INTO users VALUES (2, 'Bob', 25)")
    db.exec("INSERT INTO users VALUES (3, 'Charlie', 35)")
    db.close()
    resource = new SQLiteResource({ path: dbPath })
  })

  afterEach(async () => {
    resource.close()
    await fs.rm(path.dirname(dbPath), { recursive: true, force: true })
  })

  test('list root returns tables', async () => {
    const entries = await resource.list('/')
    expect(entries.length).toBe(1)
    expect(entries[0].name).toBe('users')
    expect(entries[0].type).toBe('directory')
  })

  test('list table returns rows by PK', async () => {
    const entries = await resource.list('/users')
    expect(entries.length).toBe(3)
    expect(entries.map(e => e.name).sort()).toEqual(['1', '2', '3'])
  })

  test('read row returns JSON', async () => {
    const data = await resource.read('/users/1')
    const row = JSON.parse(data.toString())
    expect(row.name).toBe('Alice')
    expect(row.age).toBe(30)
  })

  test('write inserts a row', async () => {
    await resource.write('/users/4', Buffer.from(JSON.stringify({ id: 4, name: 'Dave', age: 40 })))
    const data = await resource.read('/users/4')
    expect(row => expect(JSON.parse(data.toString()).name).toBe('Dave'))
  })

  test('delete removes a row', async () => {
    await resource.delete('/users/3')
    const entries = await resource.list('/users')
    expect(entries.length).toBe(2)
  })

  test('listWithContext returns schema and row count', async () => {
    const entries = await resource.listWithContext('/')
    expect(entries.length).toBe(1)
    expect(entries[0].meta?.rowCount).toBe(3)
    expect(entries[0].meta?.schema).toEqual(['id', 'name', 'age'])
  })
})
