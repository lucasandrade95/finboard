import type { AppDatabase } from '../../db/connection.js'
import type { CreateTransferInput } from './schemas.js'

/** Categoria fixa dos dois lançamentos: deixa o par visível (e filtrável) na listagem. */
export const TRANSFER_CATEGORY = 'transferência'

export interface TransferRecord {
  id: number
  /** `null` quando a conta foi excluída depois: o lançamento fica sem conta. */
  fromAccountId: number | null
  toAccountId: number | null
  amountCents: number
  occurredOn: string
  description: string
  createdAt: string
}

interface TransferRow {
  id: number
  from_account_id: number | null
  to_account_id: number | null
  amount_cents: number
  occurred_on: string
  description: string
  created_at: string
}

function toRecord(row: TransferRow): TransferRecord {
  return {
    id: row.id,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    amountCents: row.amount_cents,
    occurredOn: row.occurred_on,
    description: row.description,
    createdAt: row.created_at,
  }
}

/**
 * Transferência entre contas do mesmo usuário, gravada como um par de
 * lançamentos vinculados: saída (`expense`) na origem e entrada (`income`) no
 * destino. O saldo por conta já soma lançamentos, então as duas contas mudam sem
 * código especial; os totais de receita e despesa ignoram quem tem `transfer_id`.
 */
export class TransfersRepository {
  constructor(private readonly db: AppDatabase) {}

  /** As duas pernas são lidas pelo tipo: a saída diz a origem, a entrada diz o destino. */
  private rows(userId: number, filters: { month?: string; id?: number }): TransferRow[] {
    const conditions = ['tr.user_id = @userId']
    if (filters.month) conditions.push('out_leg.occurred_on LIKE @monthPattern')
    if (filters.id !== undefined) conditions.push('tr.id = @id')
    return this.db
      .prepare(
        `SELECT tr.id, tr.created_at,
                out_leg.account_id AS from_account_id, in_leg.account_id AS to_account_id,
                out_leg.amount_cents, out_leg.occurred_on, out_leg.description
         FROM transfers tr
         JOIN transactions out_leg ON out_leg.transfer_id = tr.id AND out_leg.type = 'expense'
         JOIN transactions in_leg ON in_leg.transfer_id = tr.id AND in_leg.type = 'income'
         WHERE ${conditions.join(' AND ')}
         ORDER BY out_leg.occurred_on DESC, tr.id DESC`,
      )
      .all({
        userId,
        ...(filters.month ? { monthPattern: `${filters.month}-%` } : {}),
        ...(filters.id === undefined ? {} : { id: filters.id }),
      }) as TransferRow[]
  }

  /** Tudo ou nada: nunca fica uma perna sem a outra (dinheiro sumindo ou aparecendo). */
  create(userId: number, input: CreateTransferInput): TransferRecord {
    const insertPair = this.db.transaction(() => {
      const transferId = Number(
        this.db.prepare('INSERT INTO transfers (user_id) VALUES (?)').run(userId).lastInsertRowid,
      )
      const insertLeg = this.db.prepare(
        `INSERT INTO transactions
           (user_id, type, description, amount_cents, category, occurred_on, recurring,
            account_id, transfer_id)
         VALUES
           (@userId, @type, @description, @amountCents, @category, @occurredOn, 0,
            @accountId, @transferId)`,
      )
      const leg = {
        userId,
        description: input.description,
        amountCents: input.amountCents,
        category: TRANSFER_CATEGORY,
        occurredOn: input.occurredOn,
        transferId,
      }
      insertLeg.run({ ...leg, type: 'expense', accountId: input.fromAccountId })
      insertLeg.run({ ...leg, type: 'income', accountId: input.toAccountId })
      return transferId
    })
    const created = this.findById(userId, insertPair())
    if (!created) {
      throw new Error('transferência recém-criada não encontrada')
    }
    return created
  }

  findById(userId: number, id: number): TransferRecord | undefined {
    const [row] = this.rows(userId, { id })
    return row ? toRecord(row) : undefined
  }

  list(userId: number, month?: string): TransferRecord[] {
    return this.rows(userId, { month }).map(toRecord)
  }

  /** Remove o vínculo e as duas pernas juntos; transferência de outro usuário não casa. */
  deleteById(userId: number, id: number): boolean {
    return this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM transactions WHERE transfer_id = ? AND user_id = ?')
        .run(id, userId)
      return (
        this.db.prepare('DELETE FROM transfers WHERE id = ? AND user_id = ?').run(id, userId)
          .changes > 0
      )
    })()
  }
}
