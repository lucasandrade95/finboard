export type BudgetLevel = 'ok' | 'warning' | 'over'

export interface BudgetStatus {
  /** Percentual real do gasto sobre o limite, sem teto (150 quando estourou em 50%). */
  percent: number
  /** Largura da barra, saturada em 100 para não vazar do container. */
  barPercent: number
  level: BudgetLevel
  /** Quanto o gasto passou do limite, em centavos; 0 quando não estourou. */
  overCents: number
}

/** A partir deste percentual o orçamento entra em "atenção" (ainda dentro do limite). */
export const WARNING_THRESHOLD = 80

export function budgetStatus(spentCents: number, budgetCents: number): BudgetStatus {
  const percent = Math.round((spentCents / budgetCents) * 100)
  const overCents = Math.max(0, spentCents - budgetCents)
  const level: BudgetLevel =
    overCents > 0 ? 'over' : percent >= WARNING_THRESHOLD ? 'warning' : 'ok'

  return { percent, barPercent: Math.min(100, percent), level, overCents }
}
