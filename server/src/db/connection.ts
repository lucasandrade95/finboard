import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

export type AppDatabase = Database.Database

export function openDatabase(path: string): AppDatabase {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

function migrate(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      category TEXT NOT NULL DEFAULT 'geral',
      occurred_on TEXT NOT NULL,
      recurring INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_occurred_on ON transactions (occurred_on);
  `)
  // Bancos criados antes da flag de recorrência não têm a coluna: ALTER guardado
  // pelo pragma mantém a migração idempotente até existirem migrações versionadas.
  const columns = db.prepare('PRAGMA table_info(transactions)').all() as Array<{ name: string }>
  if (!columns.some((column) => column.name === 'recurring')) {
    db.exec('ALTER TABLE transactions ADD COLUMN recurring INTEGER NOT NULL DEFAULT 0')
  }
}
