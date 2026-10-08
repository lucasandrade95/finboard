import type { AppDatabase } from '../../db/connection.js'
import { addMonths } from '../installments/repository.js'
import type { TransactionType } from '../transactions/schemas.js'

/**
 * De onde vem o lançamento previsto: já gravado com data futura (`scheduled`),
 * parcela de compra parcelada (`installment`) ou cópia ainda não gerada de uma
 * série recorrente (`recurring`).
 */
export type ProjectionSource = 'scheduled' | 'installment' | 'recurring'

export interface ProjectionEvent {
  date: string
  type: TransactionType
  description: string
  category: string
  amountCents: number
  source: ProjectionSource
}

export interface ProjectionPoint {
  date: string
  incomeCents: number
  expenseCents: number
  netCents: number
  /** Saldo previsto ao fim do dia. */
  balanceCents: number
}

export interface BalanceProjection {
  from: string
  to: string
  /** Saldo inicial das contas + lançamentos até `from`, inclusive: o dinheiro de hoje. */
  startingBalanceCents: number
  endingBalanceCents: number
  /** Pior momento do período (o próprio `from`, se nada piorar depois). */
  lowestBalanceCents: number
  lowestBalanceOn: string
  events: ProjectionEvent[]
  /** Um ponto por dia, de `from + 1` até `to`, inclusive nos dias sem movimento. */
  items: ProjectionPoint[]
}

interface EventRow {
  type: TransactionType
  description: string
  category: string
  amount_cents: number
  occurred_on: string
  recurring: 0 | 1
  installment_id: number | null
}

/** Soma dias a uma data YYYY-MM-DD. `Date.UTC` resolve virada de mês e ano sem fuso no meio. */
export function addDays(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/**
 * Próximas ocorrências de uma série recorrente a partir da última gravada, dentro
 * de (`from`, `to`]. Avança mês a mês a partir da ocorrência anterior, como a geração
 * do boot faz: aluguel do dia 31 cai em 28/02 e segue no dia 28 depois disso.
 */
export function nextRecurringDates(lastOccurredOn: string, from: string, to: string): string[] {
  const dates: string[] = []
  for (let date = addMonths(lastOccurredOn, 1); date <= to; date = addMonths(date, 1)) {
    if (date > from) {
      dates.push(date)
    }
  }
  return dates
}

function sourceOf(row: EventRow): ProjectionSource {
  if (row.installment_id !== null) {
    return 'installment'
  }
  return row.recurring === 1 ? 'recurring' : 'scheduled'
}

/**
 * Projeção de saldo: parte do saldo de hoje e soma o que já está marcado para os
 * próximos dias (parcelas e lançamentos com data futura) mais as recorrentes que
 * ainda não foram geradas. Só leitura — nada previsto é gravado.
 *
 * Pernas de transferência ficam de fora: dinheiro que muda de conta não mexe no saldo total.
 */
export class ProjectionRepository {
  constructor(private readonly db: AppDatabase) {}

  project(userId: number, from: string, days: number): BalanceProjection {
    const to = addDays(from, days)

    // Saldo inicial das contas + tudo o que já aconteceu: é o dinheiro que existe hoje.
    const { balance } = this.db
      .prepare(
        `SELECT
           (SELECT COALESCE(SUM(opening_balance_cents), 0) FROM accounts WHERE user_id = @userId)
           + (SELECT COALESCE(SUM(CASE type WHEN 'income' THEN amount_cents ELSE -amount_cents END), 0)
              FROM transactions
              WHERE user_id = @userId AND occurred_on <= @from AND transfer_id IS NULL)
           AS balance`,
      )
      .get({ userId, from }) as { balance: number }

    const scheduled = this.db
      .prepare(
        `SELECT type, description, category, amount_cents, occurred_on, recurring, installment_id
         FROM transactions
         WHERE user_id = ? AND occurred_on > ? AND occurred_on <= ? AND transfer_id IS NULL`,
      )
      .all(userId, from, to) as EventRow[]

    const events: ProjectionEvent[] = scheduled.map((row) => ({
      date: row.occurred_on,
      type: row.type,
      description: row.description,
      category: row.category,
      amountCents: row.amount_cents,
      source: sourceOf(row),
    }))
    events.push(...this.pendingRecurring(userId, from, to))
    // Mesmo dia: receita antes da despesa, como no extrato; depois por descrição.
    events.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.type === b.type ? 0 : a.type === 'income' ? -1 : 1) ||
        a.description.localeCompare(b.description, 'pt-BR'),
    )

    return {
      from,
      to,
      startingBalanceCents: balance,
      ...this.dailySeries(from, days, balance, events),
      events,
    }
  }

  /**
   * Cópias futuras das séries recorrentes (tipo + descrição + categoria, a mesma
   * chave da geração do boot), a partir da ocorrência mais recente de cada uma — com
   * o valor dela, então reajuste gravado no último lançamento já entra na previsão.
   */
  private pendingRecurring(userId: number, from: string, to: string): ProjectionEvent[] {
    const rows = this.db
      .prepare(
        `SELECT type, description, category, amount_cents, occurred_on, recurring, installment_id
         FROM transactions WHERE user_id = ? AND recurring = 1 AND transfer_id IS NULL
         ORDER BY occurred_on DESC, id DESC`,
      )
      .all(userId) as EventRow[]

    const seen = new Set<string>()
    const events: ProjectionEvent[] = []
    for (const row of rows) {
      const key = `${row.type}|${row.description}|${row.category}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      for (const date of nextRecurringDates(row.occurred_on, from, to)) {
        events.push({
          date,
          type: row.type,
          description: row.description,
          category: row.category,
          amountCents: row.amount_cents,
          source: 'recurring',
        })
      }
    }
    return events
  }

  private dailySeries(
    from: string,
    days: number,
    startingBalanceCents: number,
    events: ProjectionEvent[],
  ): Pick<
    BalanceProjection,
    'items' | 'endingBalanceCents' | 'lowestBalanceCents' | 'lowestBalanceOn'
  > {
    const byDay = new Map<string, { incomeCents: number; expenseCents: number }>()
    for (const event of events) {
      const day = byDay.get(event.date) ?? { incomeCents: 0, expenseCents: 0 }
      if (event.type === 'income') {
        day.incomeCents += event.amountCents
      } else {
        day.expenseCents += event.amountCents
      }
      byDay.set(event.date, day)
    }

    let balanceCents = startingBalanceCents
    let lowestBalanceCents = startingBalanceCents
    let lowestBalanceOn = from
    const items: ProjectionPoint[] = []
    for (let offset = 1; offset <= days; offset += 1) {
      const date = addDays(from, offset)
      const { incomeCents, expenseCents } = byDay.get(date) ?? { incomeCents: 0, expenseCents: 0 }
      const netCents = incomeCents - expenseCents
      balanceCents += netCents
      // Estritamente menor: o primeiro dia do fundo é o que vale avisar.
      if (balanceCents < lowestBalanceCents) {
        lowestBalanceCents = balanceCents
        lowestBalanceOn = date
      }
      items.push({ date, incomeCents, expenseCents, netCents, balanceCents })
    }
    return { items, endingBalanceCents: balanceCents, lowestBalanceCents, lowestBalanceOn }
  }
}
