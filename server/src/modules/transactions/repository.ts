import type { AppDatabase } from '../../db/connection.js'
import type { CreateTransactionInput, TransactionType, UpdateTransactionInput } from './schemas.js'

export interface TransactionRecord {
  id: number
  type: TransactionType
  description: string
  amountCents: number
  category: string
  occurredOn: string
  createdAt: string
}

export interface TransactionPage {
  items: TransactionRecord[]
  total: number
}

export interface MonthlySummary {
  incomeCents: number
  expenseCents: number
  balanceCents: number
}

interface TransactionRow {
  id: number
  type: TransactionType
  description: string
  amount_cents: number
  category: string
  occurred_on: string
  created_at: string
}

function toRecord(row: TransactionRow): TransactionRecord {
  return {
    id: row.id,
    type: row.type,
    description: row.description,
    amountCents: row.amount_cents,
    category: row.category,
    occurredOn: row.occurred_on,
    createdAt: row.created_at,
  }
}

export class TransactionsRepository {
  constructor(private readonly db: AppDatabase) {}

  create(input: CreateTransactionInput): TransactionRecord {
    const result = this.db
      .prepare(
        `INSERT INTO transactions (type, description, amount_cents, category, occurred_on)
         VALUES (@type, @description, @amountCents, @category, @occurredOn)`,
      )
      .run(input)
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
             category = @category, occurred_on = @occurredOn
         WHERE id = @id`,
      )
      .run({ ...input, id })
    return result.changes > 0 ? this.findById(id) : undefined
  }

  deleteById(id: number): boolean {
    const result = this.db.prepare('DELETE FROM transactions WHERE id = ?').run(id)
    return result.changes > 0
  }

  listByMonth(month: string | undefined, limit: number, offset: number): TransactionPage {
    const where = month ? 'WHERE occurred_on LIKE ?' : ''
    const params = month ? [`${month}-%`] : []
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
}
