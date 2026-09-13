import type { AppDatabase } from '../../db/connection.js'

/** Forma pública do usuário: o hash da senha nunca sai do repositório por aqui. */
export interface UserRecord {
  id: number
  email: string
  createdAt: string
}

export interface UserCredentials {
  user: UserRecord
  passwordHash: string
}

interface UserRow {
  id: number
  email: string
  password_hash: string
  created_at: string
}

function toRecord(row: UserRow): UserRecord {
  return { id: row.id, email: row.email, createdAt: row.created_at }
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'SQLITE_CONSTRAINT_UNIQUE'
}

export class UsersRepository {
  constructor(private readonly db: AppDatabase) {}

  /**
   * Devolve `undefined` se o e-mail já existe. A checagem é o próprio UNIQUE do
   * banco, não um SELECT antes do INSERT: dois cadastros simultâneos com o mesmo
   * e-mail não conseguem passar os dois.
   */
  create(email: string, passwordHash: string): UserRecord | undefined {
    try {
      const result = this.db
        .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
        .run(email, passwordHash)
      return this.findById(Number(result.lastInsertRowid))
    } catch (error) {
      if (isUniqueViolation(error)) return undefined
      throw error
    }
  }

  findById(id: number): UserRecord | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
    return row ? toRecord(row) : undefined
  }

  findCredentialsByEmail(email: string): UserCredentials | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
      UserRow | undefined
    return row ? { user: toRecord(row), passwordHash: row.password_hash } : undefined
  }
}
