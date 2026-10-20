import type { FastifyBaseLogger } from 'fastify'
import type { AppDatabase } from '../../db/connection.js'
import { buildBudgetAlertEmail } from '../../mail/budget-alert-email.js'
import type { Mailer } from '../../mail/mailer.js'
import type { UsersRepository } from '../auth/repository.js'

/** Limiares avisados por e-mail, em porcentagem do orçamento, do menor para o maior. */
export const BUDGET_ALERT_THRESHOLDS = [80, 100] as const

export type BudgetAlertThreshold = (typeof BUDGET_ALERT_THRESHOLDS)[number]

export interface BudgetAlert {
  category: string
  month: string
  /** Maior limiar alcançado nesta chamada: é ele que vira o assunto do e-mail. */
  threshold: BudgetAlertThreshold
  budgetCents: number
  spentCents: number
}

/** Uma categoria num mês: a unidade em que o gasto é comparado ao orçamento. */
export interface BudgetScope {
  category: string
  month: string
}

/**
 * Guarda quais limiares já foram avisados. Cada limiar é avisado uma vez por
 * categoria e mês: se o gasto cair (despesa excluída) e voltar a subir, ninguém
 * recebe o mesmo e-mail de novo. No mês seguinte o orçamento recomeça do zero,
 * então os avisos também.
 */
export class BudgetAlertsRepository {
  constructor(private readonly db: AppDatabase) {}

  /**
   * Compara o gasto da categoria no mês com o orçamento e registra os limiares
   * recém-alcançados. Devolve o aviso a mandar, ou `undefined` se não há orçamento
   * ou nenhum limiar novo. Se a despesa pular de 50% para 120%, os dois limiares
   * são gravados e sai só o de 100% — dois e-mails seguidos seriam ruído.
   */
  claim(userId: number, { category, month }: BudgetScope): BudgetAlert | undefined {
    return this.db.transaction(() => {
      const row = this.db
        .prepare(
          `SELECT b.amount_cents AS budget,
                  COALESCE((SELECT SUM(t.amount_cents) FROM transactions t
                            WHERE t.user_id = b.user_id AND t.type = 'expense'
                              AND t.category = b.category AND t.transfer_id IS NULL
                              AND t.occurred_on LIKE ?), 0) AS spent
           FROM budgets b
           WHERE b.user_id = ? AND b.category = ?`,
        )
        .get(`${month}-%`, userId, category) as { budget: number; spent: number } | undefined
      if (!row) {
        return undefined
      }

      const insert = this.db.prepare(
        `INSERT INTO budget_alerts (user_id, category, month, threshold) VALUES (?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
      )
      let reached: BudgetAlertThreshold | undefined
      for (const threshold of BUDGET_ALERT_THRESHOLDS) {
        // Inteiros dos dois lados: gasto/orçamento >= limiar/100, sem divisão em float.
        if (row.spent * 100 < row.budget * threshold) break
        if (insert.run(userId, category, month, threshold).changes > 0) {
          reached = threshold
        }
      }
      return reached === undefined
        ? undefined
        : { category, month, threshold: reached, budgetCents: row.budget, spentCents: row.spent }
    })()
  }
}

/**
 * Liga o registro dos avisos ao envio do e-mail. As rotas chamam `check` depois de
 * gravar uma despesa; o envio não é aguardado, então provedor lento ou fora do ar
 * não atrasa nem derruba o lançamento — só vai para o log.
 */
export class BudgetAlertNotifier {
  constructor(
    private readonly alerts: BudgetAlertsRepository,
    private readonly users: UsersRepository,
    private readonly mailer: Mailer,
    private readonly appUrl: string,
  ) {}

  check(userId: number, scopes: readonly BudgetScope[], log: FastifyBaseLogger): void {
    // Importação de CSV traz várias linhas da mesma categoria: avalia cada par uma vez só.
    const unique = new Map(scopes.map((scope) => [`${scope.month}|${scope.category}`, scope]))
    for (const scope of unique.values()) {
      const alert = this.alerts.claim(userId, scope)
      if (!alert) continue
      const user = this.users.findById(userId)
      if (!user) return
      const message = buildBudgetAlertEmail({ to: user.email, appUrl: this.appUrl, ...alert })
      this.mailer.send(message).catch((error: unknown) => {
        log.error(error, 'falha ao enviar e-mail de alerta de orçamento')
      })
    }
  }
}

/** Par categoria/mês de uma transação, se ela conta no orçamento (despesa). */
export function expenseScope(transaction: {
  type: string
  category: string
  occurredOn: string
}): BudgetScope[] {
  return transaction.type === 'expense'
    ? [{ category: transaction.category, month: transaction.occurredOn.slice(0, 7) }]
    : []
}
