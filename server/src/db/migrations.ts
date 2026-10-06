import type { AppDatabase } from './connection.js'

export interface Migration {
  /** Inteiro sequencial e imutável: é a chave gravada em schema_migrations. */
  id: number
  name: string
  up: (db: AppDatabase) => void
}

/**
 * Banco que rodava single-user: com exatamente um usuário cadastrado ele é, sem
 * ambiguidade, o dono do que existia antes do escopo. Com zero ou vários não há
 * escolha segura — as linhas ficam sem dono (nada é apagado) e param de aparecer
 * na API até alguém reatribuir.
 */
function soleUserId(db: AppDatabase): number | undefined {
  const users = db.prepare('SELECT id FROM users LIMIT 2').all() as Array<{ id: number }>
  return users.length === 1 ? users[0]?.id : undefined
}

function hasColumn(db: AppDatabase, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return columns.some((info) => info.name === column)
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
  {
    id: 6,
    name: 'add_transactions_user_id',
    up: (db) => {
      if (!hasColumn(db, 'transactions', 'user_id')) {
        // Anulável de propósito: o ALTER TABLE do SQLite não aceita NOT NULL sem
        // default, e qualquer default aqui apontaria para um usuário inventado.
        db.exec('ALTER TABLE transactions ADD COLUMN user_id INTEGER REFERENCES users(id)')
      }
      // Todo filtro passa a começar por user_id; o mês continua no índice para o
      // recorte do período não virar varredura da conta inteira.
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_transactions_user_occurred_on ON transactions (user_id, occurred_on)',
      )
      const owner = soleUserId(db)
      if (owner) {
        db.prepare('UPDATE transactions SET user_id = ? WHERE user_id IS NULL').run(owner)
      }
    },
  },
  {
    id: 7,
    name: 'add_budgets_user_id',
    up: (db) => {
      if (!hasColumn(db, 'budgets', 'user_id')) {
        // A chave primária deixa de ser só a categoria e passa a ser (dono, categoria):
        // duas contas podem ter teto para "mercado" sem uma sobrescrever a outra.
        // SQLite não troca chave primária por ALTER TABLE — recria e copia.
        db.exec(`
          CREATE TABLE budgets_scoped (
            user_id INTEGER REFERENCES users(id),
            category TEXT NOT NULL,
            amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, category)
          );
          INSERT INTO budgets_scoped (user_id, category, amount_cents, created_at)
            SELECT NULL, category, amount_cents, created_at FROM budgets;
          DROP TABLE budgets;
          ALTER TABLE budgets_scoped RENAME TO budgets;
        `)
      }
      const owner = soleUserId(db)
      if (owner) {
        db.prepare('UPDATE budgets SET user_id = ? WHERE user_id IS NULL').run(owner)
      }
    },
  },
  {
    id: 8,
    name: 'add_goals_user_id',
    up: (db) => {
      if (!hasColumn(db, 'goals', 'user_id')) {
        db.exec('ALTER TABLE goals ADD COLUMN user_id INTEGER REFERENCES users(id)')
      }
      // A listagem é sempre "as metas desta conta": o dono abre o índice, o prazo
      // ordena dentro dele.
      db.exec('CREATE INDEX IF NOT EXISTS idx_goals_user_deadline ON goals (user_id, deadline)')
      const owner = soleUserId(db)
      if (owner) {
        db.prepare('UPDATE goals SET user_id = ? WHERE user_id IS NULL').run(owner)
      }
    },
  },
  {
    id: 9,
    name: 'create_categories',
    up: (db) => {
      // As transações continuam guardando o nome da categoria em texto: o catálogo
      // dá cor e ícone a esses nomes sem exigir migrar cada lançamento para uma FK.
      // O UNIQUE com NOCASE impede "Mercado" e "mercado" lado a lado na mesma conta.
      db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          name TEXT NOT NULL COLLATE NOCASE,
          color TEXT NOT NULL,
          icon TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (user_id, name)
        );
      `)
    },
  },
  {
    id: 10,
    name: 'create_accounts',
    up: (db) => {
      // Saldo inicial pode ser negativo (cartão já devendo, cheque especial): sem CHECK
      // de sinal. O saldo atual não é coluna — sai da soma dos lançamentos da conta.
      db.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          name TEXT NOT NULL COLLATE NOCASE,
          opening_balance_cents INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (user_id, name)
        );
      `)
      if (!hasColumn(db, 'transactions', 'account_id')) {
        // Anulável: lançamento antigo (e quem não usa contas) segue sem conta.
        db.exec('ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id)')
      }
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id, occurred_on)',
      )
    },
  },
  {
    id: 11,
    name: 'create_transfers',
    up: (db) => {
      // A transferência é só o vínculo: valor, data e contas ficam nos dois
      // lançamentos (saída na origem, entrada no destino), que já alimentam o saldo
      // por conta sem nenhuma conta especial. `transfer_id` preenchido marca o par
      // para ficar fora dos totais de receita e despesa.
      db.exec(`
        CREATE TABLE IF NOT EXISTS transfers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)
      if (!hasColumn(db, 'transactions', 'transfer_id')) {
        db.exec('ALTER TABLE transactions ADD COLUMN transfer_id INTEGER REFERENCES transfers(id)')
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_transfer ON transactions (transfer_id)')
    },
  },
  {
    id: 12,
    name: 'create_tags',
    up: (db) => {
      // N:N clássico: a tag existe uma vez por usuário (NOCASE, como categorias e
      // contas) e a tabela de junção liga quantas transações quiser. O CASCADE limpa
      // o vínculo quando a transação some — inclusive as pernas de transferência.
      db.exec(`
        CREATE TABLE IF NOT EXISTS tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          name TEXT NOT NULL COLLATE NOCASE,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (user_id, name)
        );
        CREATE TABLE IF NOT EXISTS transaction_tags (
          transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
          tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
          PRIMARY KEY (transaction_id, tag_id)
        );
        CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag ON transaction_tags (tag_id);
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
