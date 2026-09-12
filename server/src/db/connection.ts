import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations.js'

export type AppDatabase = Database.Database

export interface OpenDatabaseOptions {
  /** Recebe os nomes das migrações aplicadas nesta subida (vazio se já estava em dia). */
  onMigrated?: (applied: string[]) => void
}

export function openDatabase(path: string, options: OpenDatabaseOptions = {}): AppDatabase {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // Em linha separada de propósito: `fn?.(runMigrations(db))` não avaliaria o
  // argumento quando o callback é omitido — o banco subiria sem schema.
  const applied = runMigrations(db)
  options.onMigrated?.(applied)
  return db
}
