import type { AppDatabase } from '../../db/connection.js'
import type { CreateGoalInput, UpdateGoalInput } from './schemas.js'

export interface GoalRecord {
  id: number
  name: string
  targetCents: number
  savedCents: number
  deadline: string | null
  createdAt: string
}

interface GoalRow {
  id: number
  name: string
  target_cents: number
  saved_cents: number
  deadline: string | null
  created_at: string
}

function toRecord(row: GoalRow): GoalRecord {
  return {
    id: row.id,
    name: row.name,
    targetCents: row.target_cents,
    savedCents: row.saved_cents,
    deadline: row.deadline,
    createdAt: row.created_at,
  }
}

/**
 * Meta de economia é independente das transações de propósito: o valor guardado
 * é informado pelo usuário (aporte), não deduzido do saldo. Ligar meta a
 * transações exigiria decidir "qual receita conta como poupança", e isso muda
 * de pessoa para pessoa.
 *
 * O `userId` é o primeiro argumento de todo método e entra no WHERE de leitura e
 * de escrita: meta de outra conta não casa e a rota responde 404.
 */
export class GoalsRepository {
  constructor(private readonly db: AppDatabase) {}

  create(userId: number, input: CreateGoalInput): GoalRecord {
    const result = this.db
      .prepare(
        `INSERT INTO goals (user_id, name, target_cents, saved_cents, deadline)
         VALUES (@userId, @name, @targetCents, @savedCents, @deadline)`,
      )
      .run({ ...input, userId })
    const created = this.findById(userId, Number(result.lastInsertRowid))
    if (!created) {
      throw new Error('meta recém-criada não encontrada')
    }
    return created
  }

  findById(userId: number, id: number): GoalRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?')
      .get(id, userId) as GoalRow | undefined
    return row ? toRecord(row) : undefined
  }

  // Prazo mais próximo primeiro; metas sem prazo vão para o fim, na ordem de criação.
  list(userId: number): GoalRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY deadline IS NULL, deadline, id')
      .all(userId) as GoalRow[]
    return rows.map(toRecord)
  }

  updateById(userId: number, id: number, input: UpdateGoalInput): GoalRecord | undefined {
    const result = this.db
      .prepare(
        `UPDATE goals
         SET name = @name, target_cents = @targetCents, saved_cents = @savedCents,
             deadline = @deadline
         WHERE id = @id AND user_id = @userId`,
      )
      .run({ ...input, id, userId })
    return result.changes > 0 ? this.findById(userId, id) : undefined
  }

  /**
   * Aporte soma no banco (`saved_cents + ?`) em vez de ler-somar-gravar no
   * cliente: dois aportes simultâneos não se sobrescrevem.
   */
  contribute(userId: number, id: number, amountCents: number): GoalRecord | undefined {
    const result = this.db
      .prepare('UPDATE goals SET saved_cents = saved_cents + ? WHERE id = ? AND user_id = ?')
      .run(amountCents, id, userId)
    return result.changes > 0 ? this.findById(userId, id) : undefined
  }

  deleteById(userId: number, id: number): boolean {
    return (
      this.db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
    )
  }
}
