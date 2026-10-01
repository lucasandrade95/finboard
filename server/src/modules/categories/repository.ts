import type { AppDatabase } from '../../db/connection.js'
import type { CreateCategoryInput, UpdateCategoryInput } from './schemas.js'

export interface CategoryRecord {
  id: number
  name: string
  color: string
  icon: string | null
  createdAt: string
}

interface CategoryRow {
  id: number
  name: string
  color: string
  icon: string | null
  created_at: string
}

/** Resultado de escrita: o nome pode colidir com outra categoria da mesma conta. */
export type CategoryWriteResult =
  { status: 'ok'; category: CategoryRecord } | { status: 'not_found' } | { status: 'conflict' }

function toRecord(row: CategoryRow): CategoryRecord {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    createdAt: row.created_at,
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'SQLITE_CONSTRAINT_UNIQUE'
}

/**
 * Catálogo de categorias da conta: nome, cor e ícone.
 *
 * As transações e os orçamentos seguem referenciando a categoria pelo nome (texto),
 * então renomear aqui propaga o novo nome para os dois, na mesma transação do
 * banco — senão o histórico ficaria preso ao nome antigo, fora do catálogo.
 * Remover do catálogo não mexe em lançamento nenhum: o nome só perde cor e ícone.
 */
export class CategoriesRepository {
  constructor(private readonly db: AppDatabase) {}

  create(userId: number, input: CreateCategoryInput): CategoryWriteResult {
    try {
      const result = this.db
        .prepare(
          `INSERT INTO categories (user_id, name, color, icon)
           VALUES (@userId, @name, @color, @icon)`,
        )
        .run({ ...input, userId })
      const created = this.findById(userId, Number(result.lastInsertRowid))
      if (!created) {
        throw new Error('categoria recém-criada não encontrada')
      }
      return { status: 'ok', category: created }
    } catch (error) {
      if (isUniqueViolation(error)) return { status: 'conflict' }
      throw error
    }
  }

  findById(userId: number, id: number): CategoryRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?')
      .get(id, userId) as CategoryRow | undefined
    return row ? toRecord(row) : undefined
  }

  list(userId: number): CategoryRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM categories WHERE user_id = ?')
      .all(userId) as CategoryRow[]
    // Ordem alfabética do pt-BR (acentos no lugar certo), igual às categorias usadas.
    return rows.map(toRecord).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }

  updateById(userId: number, id: number, input: UpdateCategoryInput): CategoryWriteResult {
    const current = this.findById(userId, id)
    if (!current) return { status: 'not_found' }

    try {
      this.db.transaction(() => {
        this.db
          .prepare(
            `UPDATE categories SET name = @name, color = @color, icon = @icon
             WHERE id = @id AND user_id = @userId`,
          )
          .run({ ...input, id, userId })
        if (current.name !== input.name) {
          this.db
            .prepare('UPDATE transactions SET category = ? WHERE user_id = ? AND category = ?')
            .run(input.name, userId, current.name)
          // OR IGNORE: se já existe orçamento com o nome novo, ele vence e o antigo
          // fica onde está — nada é sobrescrito nem apagado sem o usuário pedir.
          this.db
            .prepare('UPDATE OR IGNORE budgets SET category = ? WHERE user_id = ? AND category = ?')
            .run(input.name, userId, current.name)
        }
      })()
    } catch (error) {
      if (isUniqueViolation(error)) return { status: 'conflict' }
      throw error
    }

    const updated = this.findById(userId, id)
    return updated ? { status: 'ok', category: updated } : { status: 'not_found' }
  }

  deleteById(userId: number, id: number): boolean {
    return (
      this.db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(id, userId)
        .changes > 0
    )
  }
}
