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
 */
export class BudgetsRepository {
  constructor(private readonly db: AppDatabase) {}

  upsert(category: string, amountCents: number): BudgetRecord {
    this.db
      .prepare(
        `INSERT INTO budgets (category, amount_cents) VALUES (?, ?)
         ON CONFLICT (category) DO UPDATE SET amount_cents = excluded.amount_cents`,
      )
      .run(category, amountCents)
    return { category, amountCents }
  }

  deleteByCategory(category: string): boolean {
    return this.db.prepare('DELETE FROM budgets WHERE category = ?').run(category).changes > 0
  }

  /**
   * Cada orçamento com o total gasto (despesas) na categoria no mês. Subquery
   * correlacionada em vez de JOIN + GROUP BY: orçamento sem despesa no mês
   * continua na lista com gasto zero.
   */
  progressForMonth(month: string): BudgetProgressList {
    const rows = this.db
      .prepare(
        `SELECT b.category, b.amount_cents AS budget,
                COALESCE((SELECT SUM(t.amount_cents) FROM transactions t
                          WHERE t.type = 'expense' AND t.category = b.category
                            AND t.occurred_on LIKE ?), 0) AS spent
         FROM budgets b`,
      )
      .all(`${month}-%`) as Array<{ category: string; budget: number; spent: number }>

    // Ordena em JS: o ORDER BY do SQLite compara byte a byte e joga acentuados para o fim.
    const items = rows
      .map((row) => ({ category: row.category, budgetCents: row.budget, spentCents: row.spent }))
      .sort((a, b) => a.category.localeCompare(b.category, 'pt-BR'))
    return { month, items }
  }
}
