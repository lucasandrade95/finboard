import type { AppDatabase } from './connection.js'

export interface Migration {
  /** Inteiro sequencial e imutável: é a chave gravada em schema_migrations. */
  id: number
  name: string
  up: (db: AppDatabase) => void
}

/**
 * Migrações versionadas: cada passo roda uma única vez e fica registrado em
 * `schema_migrations`. A ordem é a ordem histórica do schema — nunca edite nem
 * renumere uma migração já publicada; acrescente uma nova no fim.
 *
 * Todas continuam idempotentes (`IF NOT EXISTS` / guarda por PRAGMA) porque os
 * bancos criados antes deste runner já têm as tabelas e não têm a tabela de
 * controle: na primeira subida elas são re-executadas para serem registradas, e
 * precisam ser inofensivas nesse cenário.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'create_transactions',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
          description TEXT NOT NULL,
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          category TEXT NOT NULL DEFAULT 'geral',
          occurred_on TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_transactions_occurred_on ON transactions (occurred_on);
      `)
    },
  },
  {
    id: 2,
    name: 'add_transactions_recurring',
    up: (db) => {
      const columns = db.prepare('PRAGMA table_info(transactions)').all() as Array<{ name: string }>
      if (!columns.some((column) => column.name === 'recurring')) {
        db.exec('ALTER TABLE transactions ADD COLUMN recurring INTEGER NOT NULL DEFAULT 0')
      }
    },
  },
  {
    id: 3,
    name: 'create_budgets',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS budgets (
          category TEXT PRIMARY KEY,
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)
    },
  },
  {
    id: 4,
    name: 'create_goals',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS goals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          target_cents INTEGER NOT NULL CHECK (target_cents > 0),
          saved_cents INTEGER NOT NULL DEFAULT 0 CHECK (saved_cents >= 0),
          deadline TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)
    },
  },
  {
    id: 5,
    name: 'create_users',
    up: (db) => {
      // E-mail já chega normalizado (trim + minúsculas) pelo Zod; o COLLATE NOCASE
      // é a segunda linha de defesa para o UNIQUE não aceitar variação de caixa.
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)
    },
  },
]

/**
 * Falha cedo (no boot, não no meio de um request) se a lista estiver malformada:
 * id repetido ou fora de ordem quebraria o controle de "o que já rodou".
 */
function assertWellOrdered(migrations: readonly Migration[]): void {
  let previous = 0
  for (const migration of migrations) {
    if (migration.id <= previous) {
      throw new Error(
        `migrações fora de ordem: id ${migration.id} (${migration.name}) vem depois de ${previous}`,
      )
    }
    previous = migration.id
  }
}

/**
 * Aplica as migrações pendentes e devolve os nomes das que rodaram agora.
 * Cada migração roda dentro de uma transação junto do próprio registro: ou o
 * passo inteiro entra, ou o banco fica exatamente como estava.
 */
export function runMigrations(
  db: AppDatabase,
  migrations: readonly Migration[] = MIGRATIONS,
): string[] {
  assertWellOrdered(migrations)

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const applied = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: number }>).map(
      (row) => row.id,
    ),
  )
  const record = db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)')

  const executed: string[] = []
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    db.transaction(() => {
      migration.up(db)
      record.run(migration.id, migration.name)
    })()
    executed.push(migration.name)
  }
  return executed
}
