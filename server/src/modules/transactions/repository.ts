import type { AppDatabase } from '../../db/connection.js'
import type { CreateTransactionInput, TransactionType, UpdateTransactionInput } from './schemas.js'

export interface TransactionRecord {
  id: number
  type: TransactionType
  description: string
  amountCents: number
  category: string
  occurredOn: string
  recurring: boolean
  createdAt: string
}

export interface TransactionPage {
  items: TransactionRecord[]
  total: number
}

export interface ListTransactionsFilters {
  month?: string
  type?: TransactionType
  category?: string
  q?: string
  limit: number
  offset: number
}

export interface MonthlySummary {
  incomeCents: number
  expenseCents: number
  balanceCents: number
}

export interface PreviousMonthSummary extends MonthlySummary {
  month: string
}

export interface SummaryWithComparison extends MonthlySummary {
  /** Presente apenas quando o resumo é de um mês específico. */
  previous?: PreviousMonthSummary
}

export interface CategoryTotal {
  category: string
  totalCents: number
}

export interface ExpensesByCategory {
  items: CategoryTotal[]
  totalCents: number
}

export interface DailyBalancePoint {
  date: string
  incomeCents: number
  expenseCents: number
  /** Resultado do próprio dia (receitas − despesas). */
  netCents: number
  /** Saldo acumulado do primeiro dia do mês até este. */
  balanceCents: number
}

export interface DailyBalance {
  month: string
  items: DailyBalancePoint[]
}

interface TransactionRow {
  id: number
  type: TransactionType
  description: string
  amount_cents: number
  category: string
  occurred_on: string
  recurring: 0 | 1
  created_at: string
}

// `%` e `_` são curingas do LIKE: escapa para que a busca trate o texto do usuário como literal.
function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`)
}

// Dia 0 do mês seguinte é o último dia do mês pedido — cobre ano bissexto sem tabela de dias.
function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year ?? 0, monthNumber ?? 1, 0)).getUTCDate()
}

// Aritmética direta em vez de Date: sem fuso/UTC para errar. Janeiro volta para dezembro.
export function previousMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return monthNumber === 1
    ? `${(year ?? 0) - 1}-12`
    : `${year}-${String((monthNumber ?? 1) - 1).padStart(2, '0')}`
}

function dayKey(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, '0')}`
}

function toRecord(row: TransactionRow): TransactionRecord {
  return {
    id: row.id,
    type: row.type,
    description: row.description,
    amountCents: row.amount_cents,
    category: row.category,
    occurredOn: row.occurred_on,
    recurring: row.recurring === 1,
    createdAt: row.created_at,
  }
}

export class TransactionsRepository {
  constructor(private readonly db: AppDatabase) {}

  create(input: CreateTransactionInput): TransactionRecord {
    const result = this.db
      .prepare(
        `INSERT INTO transactions (type, description, amount_cents, category, occurred_on, recurring)
         VALUES (@type, @description, @amountCents, @category, @occurredOn, @recurring)`,
      )
      // better-sqlite3 não aceita boolean como parâmetro: converte para 0/1.
      .run({ ...input, recurring: input.recurring ? 1 : 0 })
    const created = this.findById(Number(result.lastInsertRowid))
    if (!created) {
      throw new Error('transação recém-criada não encontrada')
    }
    return created
  }

  findById(id: number): TransactionRecord | undefined {
    const row = this.db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as
      TransactionRow | undefined
    return row ? toRecord(row) : undefined
  }

  updateById(id: number, input: UpdateTransactionInput): TransactionRecord | undefined {
    const result = this.db
      .prepare(
        `UPDATE transactions
         SET type = @type, description = @description, amount_cents = @amountCents,
             category = @category, occurred_on = @occurredOn, recurring = @recurring
         WHERE id = @id`,
      )
      .run({ ...input, id, recurring: input.recurring ? 1 : 0 })
    return result.changes > 0 ? this.findById(id) : undefined
  }

  deleteById(id: number): boolean {
    const result = this.db.prepare('DELETE FROM transactions WHERE id = ?').run(id)
    return result.changes > 0
  }

  list({ month, type, category, q, limit, offset }: ListTransactionsFilters): TransactionPage {
    const conditions: string[] = []
    const params: string[] = []
    if (month) {
      conditions.push('occurred_on LIKE ?')
      params.push(`${month}-%`)
    }
    if (type) {
      conditions.push('type = ?')
      params.push(type)
    }
    if (category) {
      conditions.push('category = ?')
      params.push(category)
    }
    if (q) {
      conditions.push(`description LIKE ? ESCAPE '\\'`)
      params.push(`%${escapeLikeTerm(q)}%`)
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = this.db
      .prepare(
        `SELECT * FROM transactions ${where} ORDER BY occurred_on DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as TransactionRow[]
    const { total } = this.db
      .prepare(`SELECT COUNT(*) AS total FROM transactions ${where}`)
      .get(...params) as { total: number }
    return { items: rows.map(toRecord), total }
  }

  listCategories(month?: string): string[] {
    const rows = (
      month
        ? this.db
            .prepare('SELECT DISTINCT category FROM transactions WHERE occurred_on LIKE ?')
            .all(`${month}-%`)
        : this.db.prepare('SELECT DISTINCT category FROM transactions').all()
    ) as Array<{ category: string }>
    // Ordena em JS: o ORDER BY do SQLite compara byte a byte e joga acentuados para o fim.
    return rows.map((row) => row.category).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }

  expensesByCategory(month?: string): ExpensesByCategory {
    const conditions = ["type = 'expense'"]
    const params: string[] = []
    if (month) {
      conditions.push('occurred_on LIKE ?')
      params.push(`${month}-%`)
    }
    const rows = this.db
      .prepare(
        `SELECT category, COALESCE(SUM(amount_cents), 0) AS total
         FROM transactions WHERE ${conditions.join(' AND ')} GROUP BY category`,
      )
      .all(...params) as Array<{ category: string; total: number }>

    // Maior gasto primeiro (é o que interessa no gráfico); empate desempata por nome.
    const items = rows
      .map((row) => ({ category: row.category, totalCents: row.total }))
      .sort((a, b) => b.totalCents - a.totalCents || a.category.localeCompare(b.category, 'pt-BR'))
    const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0)
    return { items, totalCents }
  }

  /**
   * Série com um ponto por dia do mês (inclusive dias sem movimento) e o saldo acumulado
   * desde o dia 1. Preencher os dias vazios aqui deixa o gráfico de linha proporcional ao
   * tempo — sem isso, dois lançamentos distantes viraram pontos vizinhos na linha.
   */
  dailyBalance(month: string): DailyBalance {
    const rows = this.db
      .prepare(
        `SELECT occurred_on AS date, type, COALESCE(SUM(amount_cents), 0) AS total
         FROM transactions WHERE occurred_on LIKE ? GROUP BY occurred_on, type`,
      )
      .all(`${month}-%`) as Array<{ date: string; type: TransactionType; total: number }>

    const byDay = new Map<string, { incomeCents: number; expenseCents: number }>()
    for (const row of rows) {
      const day = byDay.get(row.date) ?? { incomeCents: 0, expenseCents: 0 }
      if (row.type === 'income') {
        day.incomeCents = row.total
      } else {
        day.expenseCents = row.total
      }
      byDay.set(row.date, day)
    }

    let balanceCents = 0
    const items: DailyBalancePoint[] = []
    for (let day = 1; day <= daysInMonth(month); day += 1) {
      const date = dayKey(month, day)
      const { incomeCents, expenseCents } = byDay.get(date) ?? { incomeCents: 0, expenseCents: 0 }
      const netCents = incomeCents - expenseCents
      balanceCents += netCents
      items.push({ date, incomeCents, expenseCents, netCents, balanceCents })
    }
    return { month, items }
  }

  summaryByMonth(month?: string): MonthlySummary {
    const rows = (
      month
        ? this.db
            .prepare(
              `SELECT type, COALESCE(SUM(amount_cents), 0) AS total
               FROM transactions WHERE occurred_on LIKE ? GROUP BY type`,
            )
            .all(`${month}-%`)
        : this.db
            .prepare(
              `SELECT type, COALESCE(SUM(amount_cents), 0) AS total
               FROM transactions GROUP BY type`,
            )
            .all()
    ) as Array<{ type: TransactionType; total: number }>

    const incomeCents = rows.find((row) => row.type === 'income')?.total ?? 0
    const expenseCents = rows.find((row) => row.type === 'expense')?.total ?? 0
    return { incomeCents, expenseCents, balanceCents: incomeCents - expenseCents }
  }

  /**
   * Resumo do mês com o mês anterior anexado para comparação na UI.
   * Sem mês não há "anterior" definido: devolve só o resumo geral.
   */
  summaryWithComparison(month?: string): SummaryWithComparison {
    const current = this.summaryByMonth(month)
    if (!month) {
      return current
    }
    const reference = previousMonth(month)
    return { ...current, previous: { month: reference, ...this.summaryByMonth(reference) } }
  }

  /**
   * Gera as transações recorrentes do mês: para cada série (tipo + descrição + categoria)
   * com flag `recurring`, copia a ocorrência mais recente anterior ao mês — assim uma
   * edição de valor vale a partir do mês seguinte. Idempotente: série que já tem
   * lançamento recorrente no mês não gera de novo. Dia clampado ao tamanho do mês
   * (aluguel do dia 31 cai no dia 28/29 em fevereiro).
   */
  generateRecurringForMonth(month: string): TransactionRecord[] {
    const generate = this.db.transaction((): TransactionRecord[] => {
      const templates = this.db
        .prepare(
          `SELECT * FROM transactions WHERE recurring = 1 AND occurred_on < ?
           ORDER BY occurred_on DESC, id DESC`,
        )
        .all(`${month}-01`) as TransactionRow[]
      const existing = this.db
        .prepare(
          `SELECT DISTINCT type || '|' || description || '|' || category AS key
           FROM transactions WHERE recurring = 1 AND occurred_on LIKE ?`,
        )
        .all(`${month}-%`) as Array<{ key: string }>

      const done = new Set(existing.map((row) => row.key))
      const created: TransactionRecord[] = []
      for (const template of templates) {
        const key = `${template.type}|${template.description}|${template.category}`
        if (done.has(key)) {
          continue
        }
        done.add(key)
        const day = Math.min(Number(template.occurred_on.slice(8, 10)), daysInMonth(month))
        created.push(
          this.create({
            type: template.type,
            description: template.description,
            amountCents: template.amount_cents,
            category: template.category,
            occurredOn: dayKey(month, day),
            recurring: true,
          }),
        )
      }
      return created
    })
    return generate()
  }
}
