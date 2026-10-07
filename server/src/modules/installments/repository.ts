import type { AppDatabase } from '../../db/connection.js'
import type { TransactionsRepository } from '../transactions/repository.js'
import type { CreateInstallmentInput } from './schemas.js'

export interface InstallmentRecord {
  id: number
  description: string
  totalCents: number
  installmentCount: number
  category: string
  /** `null` quando a compra não tem conta (ou a conta foi excluída depois). */
  accountId: number | null
  firstDueOn: string
  lastDueOn: string
  createdAt: string
}

interface InstallmentRow {
  id: number
  description: string
  total_cents: number
  installment_count: number
  category: string
  account_id: number | null
  first_due_on: string
  last_due_on: string
  created_at: string
}

function toRecord(row: InstallmentRow): InstallmentRecord {
  return {
    id: row.id,
    description: row.description,
    totalCents: row.total_cents,
    installmentCount: row.installment_count,
    category: row.category,
    accountId: row.account_id,
    firstDueOn: row.first_due_on,
    lastDueOn: row.last_due_on,
    createdAt: row.created_at,
  }
}

/**
 * Divide o total em parcelas inteiras de centavos que somam exatamente o total.
 * A sobra da divisão vai para a primeira parcela, como na fatura do cartão:
 * R$ 100,00 em 3× vira 33,34 + 33,33 + 33,33.
 */
export function splitInstallments(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count)
  const remainder = totalCents - base * count
  return Array.from({ length: count }, (_, index) => (index === 0 ? base + remainder : base))
}

/**
 * Soma meses a uma data YYYY-MM-DD sem `Date` (sem fuso para errar). O dia é
 * sempre o da primeira parcela, limitado ao fim do mês: quem compra no dia 31
 * paga em 28/29 de fevereiro e volta para o dia 31 em março.
 */
export function addMonths(date: string, months: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const index = year * 12 + (month - 1) + months
  const targetYear = Math.floor(index / 12)
  const targetMonth = (index % 12) + 1
  // Dia 0 do mês seguinte é o último dia do mês alvo — cobre ano bissexto.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
  return [
    String(targetYear).padStart(4, '0'),
    String(targetMonth).padStart(2, '0'),
    String(Math.min(day, lastDay)).padStart(2, '0'),
  ].join('-')
}

/**
 * Compra parcelada: um vínculo (`installments`) e N despesas mensais comuns, uma
 * por parcela, criadas de uma vez com data futura. Como são despesas de verdade,
 * cada parcela entra no resumo, no gráfico e no orçamento do mês em que vence.
 */
export class InstallmentsRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly transactions: TransactionsRepository,
  ) {}

  /** Categoria, conta e datas saem das parcelas: o vínculo não duplica esses dados. */
  private rows(userId: number, id?: number): InstallmentRow[] {
    return this.db
      .prepare(
        `SELECT i.id, i.description, i.total_cents, i.installment_count, i.created_at,
                first.category, first.account_id,
                MIN(t.occurred_on) AS first_due_on, MAX(t.occurred_on) AS last_due_on
         FROM installments i
         JOIN transactions first ON first.installment_id = i.id AND first.installment_number = 1
         JOIN transactions t ON t.installment_id = i.id
         WHERE i.user_id = @userId ${id === undefined ? '' : 'AND i.id = @id'}
         GROUP BY i.id
         ORDER BY first_due_on DESC, i.id DESC`,
      )
      .all({ userId, ...(id === undefined ? {} : { id }) }) as InstallmentRow[]
  }

  /** Tudo ou nada: o parcelamento nunca fica com só parte das parcelas gravadas. */
  create(userId: number, input: CreateInstallmentInput): InstallmentRecord {
    const insertAll = this.db.transaction(() => {
      const installmentId = Number(
        this.db
          .prepare(
            `INSERT INTO installments (user_id, description, total_cents, installment_count)
             VALUES (?, ?, ?, ?)`,
          )
          .run(userId, input.description, input.totalCents, input.installmentCount).lastInsertRowid,
      )
      const link = this.db.prepare(
        `UPDATE transactions SET installment_id = ?, installment_number = ?
         WHERE id = ? AND user_id = ?`,
      )
      splitInstallments(input.totalCents, input.installmentCount).forEach((amountCents, index) => {
        const number = index + 1
        // Reusa a criação de transação: tags e conta seguem exatamente as mesmas regras.
        const parcel = this.transactions.create(userId, {
          type: 'expense',
          description: `${input.description} (${number}/${input.installmentCount})`,
          amountCents,
          category: input.category,
          occurredOn: addMonths(input.firstDueOn, index),
          recurring: false,
          accountId: input.accountId,
          tags: input.tags,
        })
        link.run(installmentId, number, parcel.id, userId)
      })
      return installmentId
    })
    const created = this.findById(userId, insertAll())
    if (!created) {
      throw new Error('parcelamento recém-criado não encontrado')
    }
    return created
  }

  findById(userId: number, id: number): InstallmentRecord | undefined {
    const [row] = this.rows(userId, id)
    return row ? toRecord(row) : undefined
  }

  list(userId: number): InstallmentRecord[] {
    return this.rows(userId).map(toRecord)
  }

  /** Cancela a compra inteira: o vínculo e todas as parcelas, passadas e futuras. */
  deleteById(userId: number, id: number): boolean {
    return this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM transactions WHERE installment_id = ? AND user_id = ?')
        .run(id, userId)
      return (
        this.db.prepare('DELETE FROM installments WHERE id = ? AND user_id = ?').run(id, userId)
          .changes > 0
      )
    })()
  }
}
