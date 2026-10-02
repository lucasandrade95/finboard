import type { AppDatabase } from '../../db/connection.js'
import type { CreateAccountInput, UpdateAccountInput } from './schemas.js'

export interface AccountRecord {
  id: number
  name: string
  openingBalanceCents: number
  /** Saldo inicial + receitas − despesas de todos os lançamentos da conta. */
  balanceCents: number
  createdAt: string
}

/** Saldo de uma conta numa data de corte — é o que o summary do mês devolve. */
export interface AccountBalance {
  id: number
  name: string
  balanceCents: number
}

interface AccountRow {
  id: number
  name: string
  opening_balance_cents: number
  balance_cents: number
  created_at: string
}

/** Resultado de escrita: o nome pode colidir com outra conta do mesmo usuário. */
export type AccountWriteResult =
  { status: 'ok'; account: AccountRecord } | { status: 'not_found' } | { status: 'conflict' }

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'SQLITE_CONSTRAINT_UNIQUE'
}

function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, 'pt-BR')
}

/**
 * Contas/carteiras do usuário (corrente, poupança, dinheiro, cartão).
 *
 * O saldo nunca é gravado: é sempre saldo inicial + soma assinada dos lançamentos
 * da conta, calculada na leitura. Assim editar ou excluir uma transação antiga não
 * deixa um saldo "cacheado" divergente do histórico.
 */
export class AccountsRepository {
  constructor(private readonly db: AppDatabase) {}

  /**
   * Saldo de cada conta considerando só lançamentos até `until` (YYYY-MM-DD,
   * inclusive). Sem data de corte, soma o histórico inteiro. O `user_id` também
   * entra no JOIN: lançamento de outra conta nunca soma aqui, nem por id forjado.
   */
  private rows(userId: number, until?: string, id?: number): AccountRow[] {
    const joinCut = until ? 'AND t.occurred_on <= @until' : ''
    const whereId = id === undefined ? '' : 'AND a.id = @id'
    return this.db
      .prepare(
        `SELECT a.id, a.name, a.opening_balance_cents, a.created_at,
                a.opening_balance_cents + COALESCE(SUM(
                  CASE t.type WHEN 'income' THEN t.amount_cents ELSE -t.amount_cents END
                ), 0) AS balance_cents
         FROM accounts a
         LEFT JOIN transactions t
           ON t.account_id = a.id AND t.user_id = a.user_id ${joinCut}
         WHERE a.user_id = @userId ${whereId}
         GROUP BY a.id`,
      )
      .all({
        userId,
        ...(until ? { until } : {}),
        ...(id === undefined ? {} : { id }),
      }) as AccountRow[]
  }

  private toRecord(row: AccountRow): AccountRecord {
    return {
      id: row.id,
      name: row.name,
      openingBalanceCents: row.opening_balance_cents,
      balanceCents: row.balance_cents,
      createdAt: row.created_at,
    }
  }

  create(userId: number, input: CreateAccountInput): AccountWriteResult {
    try {
      const result = this.db
        .prepare(
          `INSERT INTO accounts (user_id, name, opening_balance_cents)
           VALUES (@userId, @name, @openingBalanceCents)`,
        )
        .run({ ...input, userId })
      const created = this.findById(userId, Number(result.lastInsertRowid))
      if (!created) {
        throw new Error('conta recém-criada não encontrada')
      }
      return { status: 'ok', account: created }
    } catch (error) {
      if (isUniqueViolation(error)) return { status: 'conflict' }
      throw error
    }
  }

  findById(userId: number, id: number): AccountRecord | undefined {
    const [row] = this.rows(userId, undefined, id)
    return row ? this.toRecord(row) : undefined
  }

  /** Checagem barata usada antes de gravar `accountId` numa transação. */
  belongsTo(userId: number, id: number): boolean {
    return (
      this.db.prepare('SELECT 1 FROM accounts WHERE id = ? AND user_id = ?').get(id, userId) !==
      undefined
    )
  }

  list(userId: number): AccountRecord[] {
    return this.rows(userId)
      .map((row) => this.toRecord(row))
      .sort(byName)
  }

  /** Saldo de cada conta no fim do mês (ou hoje, no histórico inteiro, sem mês). */
  balances(userId: number, month?: string): AccountBalance[] {
    // Comparação de texto: `YYYY-MM-31` fica depois de qualquer dia do mês, inclusive
    // em fevereiro, e antes do dia 1 do mês seguinte — sem calcular o último dia.
    const until = month ? `${month}-31` : undefined
    return this.rows(userId, until)
      .map((row) => ({ id: row.id, name: row.name, balanceCents: row.balance_cents }))
      .sort(byName)
  }

  updateById(userId: number, id: number, input: UpdateAccountInput): AccountWriteResult {
    try {
      const result = this.db
        .prepare(
          `UPDATE accounts SET name = @name, opening_balance_cents = @openingBalanceCents
           WHERE id = @id AND user_id = @userId`,
        )
        .run({ ...input, id, userId })
      if (result.changes === 0) return { status: 'not_found' }
    } catch (error) {
      if (isUniqueViolation(error)) return { status: 'conflict' }
      throw error
    }
    const updated = this.findById(userId, id)
    return updated ? { status: 'ok', account: updated } : { status: 'not_found' }
  }

  /**
   * Remover a conta não apaga lançamento nenhum: eles voltam a ficar "sem conta"
   * e continuam no resumo do mês. Desvincular antes do DELETE é obrigatório com
   * `foreign_keys = ON` — senão a FK recusaria a exclusão.
   */
  deleteById(userId: number, id: number): boolean {
    return this.db.transaction(() => {
      this.db
        .prepare('UPDATE transactions SET account_id = NULL WHERE user_id = ? AND account_id = ?')
        .run(userId, id)
      return (
        this.db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(id, userId)
          .changes > 0
      )
    })()
  }
}
