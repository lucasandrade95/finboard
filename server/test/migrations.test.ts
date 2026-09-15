import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/db/connection.js'
import { MIGRATIONS, runMigrations, type Migration } from '../src/db/migrations.js'

function appliedIds(db: Database.Database): number[] {
  return (
    db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as Array<{ id: number }>
  ).map((row) => row.id)
}

function tableNames(db: Database.Database): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{
      name: string
    }>
  ).map((row) => row.name)
}

describe('runMigrations', () => {
  it('cria todo o schema em banco novo e registra cada migração', () => {
    const db = openDatabase(':memory:')

    expect(appliedIds(db)).toEqual(MIGRATIONS.map((migration) => migration.id))
    expect(tableNames(db)).toEqual(
      expect.arrayContaining(['transactions', 'budgets', 'goals', 'schema_migrations']),
    )
    db.close()
  })

  it('não reaplica migração já registrada', () => {
    const db = openDatabase(':memory:')
    const executed = runMigrations(db)

    expect(executed).toEqual([])
    expect(appliedIds(db)).toEqual(MIGRATIONS.map((migration) => migration.id))
    db.close()
  })

  it('aplica só a migração nova quando a lista cresce', () => {
    const db = openDatabase(':memory:')
    const withExtra: Migration[] = [
      ...MIGRATIONS,
      {
        id: 999,
        name: 'create_notes',
        up: (target) => target.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY);'),
      },
    ]

    expect(runMigrations(db, withExtra)).toEqual(['create_notes'])
    expect(runMigrations(db, withExtra)).toEqual([])
    expect(tableNames(db)).toContain('notes')
    db.close()
  })

  it('adota banco legado sem schema_migrations preservando os dados', () => {
    // Schema como ficava antes do runner: tabelas já criadas, nenhum registro de versão.
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
        description TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        category TEXT NOT NULL DEFAULT 'geral',
        occurred_on TEXT NOT NULL,
        recurring INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO transactions (type, description, amount_cents, category, occurred_on)
      VALUES ('expense', 'mercado', 12345, 'mercado', '2026-08-10');
    `)

    expect(runMigrations(db)).toEqual(MIGRATIONS.map((migration) => migration.name))

    const row = db.prepare('SELECT description, amount_cents FROM transactions').get()
    expect(row).toEqual({ description: 'mercado', amount_cents: 12345 })
    expect(appliedIds(db)).toEqual(MIGRATIONS.map((migration) => migration.id))
    db.close()
  })

  it('atribui o histórico sem dono ao único usuário do banco', () => {
    const db = new Database(':memory:')
    // Estado de um banco single-user: schema anterior ao escopo por usuário.
    runMigrations(
      db,
      MIGRATIONS.filter((migration) => migration.name !== 'add_transactions_user_id'),
    )
    db.exec(`
      INSERT INTO users (email, password_hash) VALUES ('lucas@example.com', 'hash');
      INSERT INTO transactions (type, description, amount_cents, category, occurred_on)
      VALUES ('expense', 'mercado', 12345, 'mercado', '2026-08-10');
    `)

    expect(runMigrations(db)).toEqual(['add_transactions_user_id'])
    expect(db.prepare('SELECT user_id FROM transactions').get()).toEqual({ user_id: 1 })
    db.close()
  })

  it('não chuta um dono quando o banco legado tem mais de um usuário', () => {
    const db = new Database(':memory:')
    runMigrations(
      db,
      MIGRATIONS.filter((migration) => migration.name !== 'add_transactions_user_id'),
    )
    db.exec(`
      INSERT INTO users (email, password_hash) VALUES ('lucas@example.com', 'hash');
      INSERT INTO users (email, password_hash) VALUES ('maria@example.com', 'hash');
      INSERT INTO transactions (type, description, amount_cents, category, occurred_on)
      VALUES ('expense', 'mercado', 12345, 'mercado', '2026-08-10');
    `)

    runMigrations(db)

    // A linha continua no banco (nada é apagado), só deixa de ter dono.
    expect(db.prepare('SELECT user_id FROM transactions').get()).toEqual({ user_id: null })
    db.close()
  })

  it('deixa o banco intacto quando uma migração falha no meio', () => {
    const db = new Database(':memory:')
    const broken: Migration[] = [
      {
        id: 1,
        name: 'create_notes',
        up: (target) => {
          target.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY);')
          throw new Error('boom')
        },
      },
    ]

    expect(() => runMigrations(db, broken)).toThrow('boom')
    expect(tableNames(db)).not.toContain('notes')
    expect(appliedIds(db)).toEqual([])
    db.close()
  })

  it('recusa lista com ids repetidos ou fora de ordem', () => {
    const db = new Database(':memory:')
    const noop = () => {}

    expect(() =>
      runMigrations(db, [
        { id: 2, name: 'b', up: noop },
        { id: 1, name: 'a', up: noop },
      ]),
    ).toThrow(/fora de ordem/)
    db.close()
  })

  it('mantém ids e nomes únicos na lista publicada', () => {
    const ids = MIGRATIONS.map((migration) => migration.id)
    const names = MIGRATIONS.map((migration) => migration.name)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })
})
