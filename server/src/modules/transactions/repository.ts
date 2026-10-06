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
  accountId: number | null
  /** Preenchido nas duas pernas de uma transferência entre contas. */
  transferId: number | null
  /** Tags livres da transação, em ordem alfabética. */
  tags: string[]
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
  tag?: string
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
  account_id: number | null
  transfer_id: number | null
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

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR')
}

function toRecord(row: TransactionRow, tags: string[]): TransactionRecord {
  return {
    id: row.id,
    type: row.type,
    description: row.description,
    amountCents: row.amount_cents,
    category: row.category,
    occurredOn: row.occurred_on,
    recurring: row.recurring === 1,
    accountId: row.account_id,
    transferId: row.transfer_id,
    tags,
    createdAt: row.created_at,
  }
}

/**
 * Todo método recebe o `userId` como primeiro argumento e ele entra no WHERE de
 * toda consulta — inclusive nas de escrita. Não existe leitura nem alteração
 * "global": um id de outra conta simplesmente não casa e a rota responde 404,
 * sem revelar que a transação existe.
 */
export class TransactionsRepository {
  constructor(private readonly db: AppDatabase) {}

  create(userId: number, input: CreateTransactionInput): TransactionRecord {
    const { tags = [], ...fields } = input
    // Linha e tags juntas: falhou no vínculo, a transação também não fica.
    const insert = this.db.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO transactions
             (user_id, type, description, amount_cents, category, occurred_on, recurring, account_id)
           VALUES
             (@userId, @type, @description, @amountCents, @category, @occurredOn, @recurring, @accountId)`,
        )
        // better-sqlite3 não aceita boolean como parâmetro: converte para 0/1.
        .run({
          ...fields,
          userId,
          recurring: fields.recurring ? 1 : 0,
          accountId: fields.accountId ?? null,
        })
      const id = Number(result.lastInsertRowid)
      this.replaceTags(userId, id, tags)
      return id
    })
    const created = this.findById(userId, insert())
    if (!created) {
      throw new Error('transação recém-criada não encontrada')
    }
    return created
  }

  /** Tudo ou nada: numa transação do SQLite, uma falha no meio desfaz as linhas já inseridas. */
  createMany(userId: number, inputs: CreateTransactionInput[]): number {
    const insertAll = this.db.transaction((items: CreateTransactionInput[]) => {
      for (const item of items) {
        this.create(userId, item)
      }
      return items.length
    })
    return insertAll(inputs)
  }

  findById(userId: number, id: number): TransactionRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
      .get(id, userId) as TransactionRow | undefined
    return row ? this.toRecords([row])[0] : undefined
  }

  /**
   * Tags de todas as linhas numa consulta só (sem N+1 na página). Os ids vão como
   * um array JSON lido por `json_each`: não esbarra no limite de parâmetros do SQLite.
   */
  private toRecords(rows: TransactionRow[]): TransactionRecord[] {
    if (rows.length === 0) {
      return []
    }
    const links = this.db
      .prepare(
        `SELECT tt.transaction_id AS transactionId, tg.name
         FROM transaction_tags tt JOIN tags tg ON tg.id = tt.tag_id
         WHERE tt.transaction_id IN (SELECT value FROM json_each(?))`,
      )
      .all(JSON.stringify(rows.map((row) => row.id))) as Array<{
      transactionId: number
      name: string
    }>
    const tagsById = new Map<number, string[]>()
    for (const { transactionId, name } of links) {
      tagsById.set(transactionId, [...(tagsById.get(transactionId) ?? []), name])
    }
    return rows.map((row) => toRecord(row, (tagsById.get(row.id) ?? []).sort(compareText)))
  }

  /**
   * Troca o conjunto de tags da transação. A tag é criada na primeira vez que
   * aparece e reaproveitada depois — "Viagem" e "viagem" são a mesma (NOCASE),
   * e o OR IGNORE da junção faz o repetido entrar uma vez só.
   */
  private replaceTags(userId: number, transactionId: number, names: string[]): void {
    this.db.prepare('DELETE FROM transaction_tags WHERE transaction_id = ?').run(transactionId)
    const insertTag = this.db.prepare('INSERT OR IGNORE INTO tags (user_id, name) VALUES (?, ?)')
    const findTag = this.db.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?')
    const link = this.db.prepare(
      'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)',
    )
    for (const name of names) {
      insertTag.run(userId, name)
      const tag = findTag.get(userId, name) as { id: number }
      link.run(transactionId, tag.id)
    }
  }

  updateById(
    userId: number,
    id: number,
    input: UpdateTransactionInput,
  ): TransactionRecord | undefined {
    // `accountId` e `tags` omitidos mantêm o que já está gravado; `null`/`[]` explícitos limpam.
    const { accountId, tags, ...fields } = input
    const keepAccount = accountId === undefined
    const update = this.db.transaction(() => {
      const result = this.db
        .prepare(
          `UPDATE transactions
           SET type = @type, description = @description, amount_cents = @amountCents,
               category = @category, occurred_on = @occurredOn, recurring = @recurring,
               account_id = ${keepAccount ? 'account_id' : '@accountId'}
           WHERE id = @id AND user_id = @userId`,
        )
        .run({
          ...fields,
          id,
          userId,
          recurring: input.recurring ? 1 : 0,
          ...(keepAccount ? {} : { accountId }),
        })
      // Só mexe nas tags depois do UPDATE casar: id de outro usuário não ganha vínculo.
      if (result.changes > 0 && tags !== undefined) {
        this.replaceTags(userId, id, tags)
      }
      return result.changes > 0
    })
    return update() ? this.findById(userId, id) : undefined
  }

  deleteById(userId: number, id: number): boolean {
    const result = this.db
      .prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?')
      .run(id, userId)
    return result.changes > 0
  }

  list(
    userId: number,
    { month, type, category, q, tag, limit, offset }: ListTransactionsFilters,
  ): TransactionPage {
    const conditions: string[] = ['user_id = ?']
    const params: Array<string | number> = [userId]
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
    if (tag) {
      // `tags.name` é NOCASE: o filtro "viagem" casa com a tag gravada como "Viagem".
      conditions.push(
        `id IN (SELECT tt.transaction_id FROM transaction_tags tt
                JOIN tags tg ON tg.id = tt.tag_id WHERE tg.user_id = ? AND tg.name = ?)`,
      )
      params.push(userId, tag)
    }
    const where = `WHERE ${conditions.join(' AND ')}`
    const rows = this.db
      .prepare(
        `SELECT * FROM transactions ${where} ORDER BY occurred_on DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as TransactionRow[]
    const { total } = this.db
      .prepare(`SELECT COUNT(*) AS total FROM transactions ${where}`)
      .get(...params) as { total: number }
    return { items: this.toRecords(rows), total }
  }

  /** Mês inteiro sem paginação, do dia 1 ao último: é a ordem natural de leitura num export. */
  listByMonth(userId: number, month: string): TransactionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM transactions WHERE user_id = ? AND occurred_on LIKE ?
         ORDER BY occurred_on, id`,
      )
      .all(userId, `${month}-%`) as TransactionRow[]
    return this.toRecords(rows)
  }

  /**
   * Tags em uso por alguma transação do usuário. Tag que perdeu o último vínculo
   * continua na tabela (é reaproveitada se voltar), mas some do filtro.
   */
  listTags(userId: number): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT tg.name FROM tags tg
         JOIN transaction_tags tt ON tt.tag_id = tg.id
         WHERE tg.user_id = ?`,
      )
      .all(userId) as Array<{ name: string }>
    return rows.map((row) => row.name).sort(compareText)
  }

  listCategories(userId: number, month?: string): string[] {
    const rows = (
      month
        ? this.db
            .prepare(
              'SELECT DISTINCT category FROM transactions WHERE user_id = ? AND occurred_on LIKE ?',
            )
            .all(userId, `${month}-%`)
        : this.db
            .prepare('SELECT DISTINCT category FROM transactions WHERE user_id = ?')
            .all(userId)
    ) as Array<{ category: string }>
    // Ordena em JS: o ORDER BY do SQLite compara byte a byte e joga acentuados para o fim.
    return rows.map((row) => row.category).sort(compareText)
  }

  expensesByCategory(userId: number, month?: string): ExpensesByCategory {
    // Transferência não é gasto: as pernas ficam fora do gráfico por categoria.
    const conditions = ['user_id = ?', "type = 'expense'", 'transfer_id IS NULL']
    const params: Array<string | number> = [userId]
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
  dailyBalance(userId: number, month: string): DailyBalance {
    const rows = this.db
      .prepare(
        `SELECT occurred_on AS date, type, COALESCE(SUM(amount_cents), 0) AS total
         FROM transactions WHERE user_id = ? AND occurred_on LIKE ? AND transfer_id IS NULL
         GROUP BY occurred_on, type`,
      )
      .all(userId, `${month}-%`) as Array<{ date: string; type: TransactionType; total: number }>

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

  /**
   * Dinheiro que só mudou de conta não é receita nem despesa: as pernas de
   * transferência ficam fora deste total (e da série diária), mas seguem no saldo por conta.
   */
  summaryByMonth(userId: number, month?: string): MonthlySummary {
    const rows = (
      month
        ? this.db
            .prepare(
              `SELECT type, COALESCE(SUM(amount_cents), 0) AS total
               FROM transactions
               WHERE user_id = ? AND occurred_on LIKE ? AND transfer_id IS NULL GROUP BY type`,
            )
            .all(userId, `${month}-%`)
        : this.db
            .prepare(
              `SELECT type, COALESCE(SUM(amount_cents), 0) AS total
               FROM transactions WHERE user_id = ? AND transfer_id IS NULL GROUP BY type`,
            )
            .all(userId)
    ) as Array<{ type: TransactionType; total: number }>

    const incomeCents = rows.find((row) => row.type === 'income')?.total ?? 0
    const expenseCents = rows.find((row) => row.type === 'expense')?.total ?? 0
    return { incomeCents, expenseCents, balanceCents: incomeCents - expenseCents }
  }

  /**
   * Resumo do mês com o mês anterior anexado para comparação na UI.
   * Sem mês não há "anterior" definido: devolve só o resumo geral.
   */
  summaryWithComparison(userId: number, month?: string): SummaryWithComparison {
    const current = this.summaryByMonth(userId, month)
    if (!month) {
      return current
    }
    const reference = previousMonth(month)
    return { ...current, previous: { month: reference, ...this.summaryByMonth(userId, reference) } }
  }

  /**
   * Donos que têm alguma série recorrente. O boot gera o mês de cada um em
   * separado: sem isso a geração só enxergaria as transações de um usuário.
   */
  listOwnersWithRecurring(): number[] {
    const rows = this.db
      .prepare(
        'SELECT DISTINCT user_id AS id FROM transactions WHERE recurring = 1 AND user_id IS NOT NULL',
      )
      .all() as Array<{ id: number }>
    return rows.map((row) => row.id)
  }

  /**
   * Gera as recorrentes do mês de um usuário: para cada série (tipo + descrição + categoria)
   * com flag `recurring`, copia a ocorrência mais recente anterior ao mês — assim uma
   * edição de valor vale a partir do mês seguinte. Idempotente: série que já tem
   * lançamento recorrente no mês não gera de novo. Dia clampado ao tamanho do mês
   * (aluguel do dia 31 cai no dia 28/29 em fevereiro).
   */
  generateRecurringForMonth(userId: number, month: string): TransactionRecord[] {
    const generate = this.db.transaction((): TransactionRecord[] => {
      const templates = this.toRecords(
        this.db
          .prepare(
            `SELECT * FROM transactions WHERE user_id = ? AND recurring = 1 AND occurred_on < ?
             ORDER BY occurred_on DESC, id DESC`,
          )
          .all(userId, `${month}-01`) as TransactionRow[],
      )
      const existing = this.db
        .prepare(
          `SELECT DISTINCT type || '|' || description || '|' || category AS key
           FROM transactions WHERE user_id = ? AND recurring = 1 AND occurred_on LIKE ?`,
        )
        .all(userId, `${month}-%`) as Array<{ key: string }>

      const done = new Set(existing.map((row) => row.key))
      const created: TransactionRecord[] = []
      for (const template of templates) {
        const key = `${template.type}|${template.description}|${template.category}`
        if (done.has(key)) {
          continue
        }
        done.add(key)
        const day = Math.min(Number(template.occurredOn.slice(8, 10)), daysInMonth(month))
        created.push(
          this.create(userId, {
            type: template.type,
            description: template.description,
            amountCents: template.amountCents,
            category: template.category,
            occurredOn: dayKey(month, day),
            recurring: true,
            // A cópia do mês cai na mesma conta da série (aluguel sai sempre da corrente)
            // e leva as mesmas tags.
            accountId: template.accountId,
            tags: template.tags,
          }),
        )
      }
      return created
    })
    return generate()
  }
}
