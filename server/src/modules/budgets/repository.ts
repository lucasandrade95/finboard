import type { AppDatabase } from '../../db/connection.js'

export interface BudgetRecord {
  category: string
  amountCents: number
}

export interface BudgetProgress {
  category: string
  budgetCents: number
  spentCents: number
}

export interface BudgetProgressList {
  month: string
  items: BudgetProgress[]
}

/**
 * Orçamento é um limite mensal por categoria, sem coluna de mês: o mesmo teto
 * vale todo mês até ser editado. Guardar um valor por mês só complicaria o CRUD
 * sem caso de uso real hoje — se surgir, vira migração.
 *
 * Como nas transações, o `userId` é o primeiro argumento de todo método e entra
 * no WHERE de leitura e de escrita: o teto de "mercado" de uma conta é invisível
 * (e intocável) para a outra.
 */
export class BudgetsRepository {
  constructor(private readonly db: AppDatabase) {}

  upsert(userId: number, category: string, amountCents: number): BudgetRecord {
    this.db
      .prepare(
        `INSERT INTO budgets (user_id, category, amount_cents) VALUES (?, ?, ?)
         ON CONFLICT (user_id, category) DO UPDATE SET amount_cents = excluded.amount_cents`,
      )
      .run(userId, category, amountCents)
    return { category, amountCents }
  }

  deleteByCategory(userId: number, category: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM budgets WHERE user_id = ? AND category = ?')
        .run(userId, category).changes > 0
    )
  }

  /**
   * Cada orçamento com o total gasto (despesas) na categoria no mês. Subquery
   * correlacionada em vez de JOIN + GROUP BY: orçamento sem despesa no mês
   * continua na lista com gasto zero. O gasto só soma transações do mesmo dono —
   * senão a despesa de uma conta estouraria o orçamento da outra.
   */
  progressForMonth(userId: number, month: string): BudgetProgressList {
    const rows = this.db
      .prepare(
        `SELECT b.category, b.amount_cents AS budget,
                COALESCE((SELECT SUM(t.amount_cents) FROM transactions t
                          WHERE t.user_id = b.user_id AND t.type = 'expense'
                            AND t.category = b.category
                            AND t.occurred_on LIKE ?), 0) AS spent
         FROM budgets b
         WHERE b.user_id = ?`,
      )
      .all(`${month}-%`, userId) as Array<{ category: string; budget: number; spent: number }>

    // Ordena em JS: o ORDER BY do SQLite compara byte a byte e joga acentuados para o fim.
    const items = rows
      .map((row) => ({ category: row.category, budgetCents: row.budget, spentCents: row.spent }))
      .sort((a, b) => a.category.localeCompare(b.category, 'pt-BR'))
    return { month, items }
  }
}
