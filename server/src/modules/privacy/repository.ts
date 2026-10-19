import type { AppDatabase } from '../../db/connection.js'

/** Versão do formato do arquivo: muda quando um campo some ou troca de significado. */
export const EXPORT_FORMAT_VERSION = 1

export interface ExportedTransaction {
  id: number
  type: 'income' | 'expense'
  description: string
  amountCents: number
  category: string
  occurredOn: string
  recurring: boolean
  accountId: number | null
  transferId: number | null
  installmentId: number | null
  installmentNumber: number | null
  tags: string[]
  createdAt: string
}

export interface ExportedAttachment {
  transactionId: number
  mimeType: string
  sizeBytes: number
  /** Bytes do comprovante em base64: o arquivo é parte dos dados do titular. */
  contentBase64: string
  uploadedAt: string
}

export interface ExportedAuditEntry {
  transactionId: number
  action: 'created' | 'updated' | 'deleted'
  changes: unknown
  at: string
}

export interface UserDataExport {
  format: 'finboard-export'
  version: typeof EXPORT_FORMAT_VERSION
  exportedAt: string
  user: { id: number; email: string; createdAt: string }
  accounts: Array<{ id: number; name: string; openingBalanceCents: number; createdAt: string }>
  categories: Array<{ id: number; name: string; color: string; icon: string | null }>
  transactions: ExportedTransaction[]
  attachments: ExportedAttachment[]
  transfers: Array<{ id: number; createdAt: string }>
  installments: Array<{
    id: number
    description: string
    totalCents: number
    installmentCount: number
    createdAt: string
  }>
  budgets: Array<{ category: string; amountCents: number; createdAt: string }>
  goals: Array<{
    id: number
    name: string
    targetCents: number
    savedCents: number
    deadline: string | null
    createdAt: string
  }>
  history: ExportedAuditEntry[]
}

interface TransactionRow {
  id: number
  type: 'income' | 'expense'
  description: string
  amount_cents: number
  category: string
  occurred_on: string
  recurring: number
  account_id: number | null
  transfer_id: number | null
  installment_id: number | null
  installment_number: number | null
  created_at: string
}

interface AttachmentRow {
  transaction_id: number
  mime_type: string
  size_bytes: number
  content: Buffer
  created_at: string
}

interface AuditRow {
  transaction_id: number
  action: ExportedAuditEntry['action']
  changes: string
  created_at: string
}

/**
 * Direitos do titular (LGPD, art. 18): portabilidade — tudo o que a conta guarda,
 * num arquivo legível por máquina — e eliminação. Fica num repositório só porque as
 * duas operações precisam conhecer todas as tabelas com dono; tabela nova com
 * `user_id` entra aqui nos dois lados.
 */
export class PrivacyRepository {
  constructor(private readonly db: AppDatabase) {}

  /** `undefined` se a conta não existe mais (token válido de conta já excluída). */
  exportUserData(userId: number, now: Date = new Date()): UserDataExport | undefined {
    // Uma transação de leitura: o arquivo é uma fotografia consistente, sem lançamento
    // novo aparecendo na lista e faltando nos vínculos.
    return this.db.transaction(() => this.collect(userId, now))()
  }

  private collect(userId: number, now: Date): UserDataExport | undefined {
    const user = this.db
      .prepare('SELECT id, email, created_at FROM users WHERE id = ?')
      .get(userId) as { id: number; email: string; created_at: string } | undefined
    if (!user) {
      return undefined
    }

    const tagsByTransaction = new Map<number, string[]>()
    const tagRows = this.db
      .prepare(
        `SELECT tt.transaction_id, tg.name FROM transaction_tags tt
         JOIN tags tg ON tg.id = tt.tag_id
         WHERE tg.user_id = ? ORDER BY tg.name`,
      )
      .all(userId) as Array<{ transaction_id: number; name: string }>
    for (const row of tagRows) {
      const list = tagsByTransaction.get(row.transaction_id) ?? []
      list.push(row.name)
      tagsByTransaction.set(row.transaction_id, list)
    }

    const transactions = (
      this.db
        .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY occurred_on, id')
        .all(userId) as TransactionRow[]
    ).map((row): ExportedTransaction => ({
      id: row.id,
      type: row.type,
      description: row.description,
      amountCents: row.amount_cents,
      category: row.category,
      occurredOn: row.occurred_on,
      recurring: row.recurring === 1,
      accountId: row.account_id,
      transferId: row.transfer_id,
      installmentId: row.installment_id,
      installmentNumber: row.installment_number,
      tags: tagsByTransaction.get(row.id) ?? [],
      createdAt: row.created_at,
    }))

    const attachments = (
      this.db
        .prepare(
          `SELECT a.* FROM transaction_attachments a
           JOIN transactions t ON t.id = a.transaction_id
           WHERE t.user_id = ? ORDER BY a.transaction_id`,
        )
        .all(userId) as AttachmentRow[]
    ).map((row) => ({
      transactionId: row.transaction_id,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      contentBase64: row.content.toString('base64'),
      uploadedAt: row.created_at,
    }))

    const history = (
      this.db
        .prepare(
          `SELECT transaction_id, action, changes, created_at FROM transaction_audit
           WHERE user_id = ? ORDER BY id`,
        )
        .all(userId) as AuditRow[]
    ).map((row) => ({
      transactionId: row.transaction_id,
      action: row.action,
      changes: JSON.parse(row.changes) as unknown,
      at: row.created_at,
    }))

    return {
      format: 'finboard-export',
      version: EXPORT_FORMAT_VERSION,
      exportedAt: now.toISOString(),
      user: { id: user.id, email: user.email, createdAt: user.created_at },
      accounts: this.db
        .prepare(
          `SELECT id, name, opening_balance_cents AS openingBalanceCents, created_at AS createdAt
           FROM accounts WHERE user_id = ? ORDER BY id`,
        )
        .all(userId) as UserDataExport['accounts'],
      categories: this.db
        .prepare('SELECT id, name, color, icon FROM categories WHERE user_id = ? ORDER BY id')
        .all(userId) as UserDataExport['categories'],
      transactions,
      attachments,
      transfers: this.db
        .prepare('SELECT id, created_at AS createdAt FROM transfers WHERE user_id = ? ORDER BY id')
        .all(userId) as UserDataExport['transfers'],
      installments: this.db
        .prepare(
          `SELECT id, description, total_cents AS totalCents,
                  installment_count AS installmentCount, created_at AS createdAt
           FROM installments WHERE user_id = ? ORDER BY id`,
        )
        .all(userId) as UserDataExport['installments'],
      budgets: this.db
        .prepare(
          `SELECT category, amount_cents AS amountCents, created_at AS createdAt
           FROM budgets WHERE user_id = ? ORDER BY category`,
        )
        .all(userId) as UserDataExport['budgets'],
      goals: this.db
        .prepare(
          `SELECT id, name, target_cents AS targetCents, saved_cents AS savedCents, deadline,
                  created_at AS createdAt
           FROM goals WHERE user_id = ? ORDER BY id`,
        )
        .all(userId) as UserDataExport['goals'],
      history,
    }
  }

  /**
   * Apaga a conta e tudo o que é dela, numa transação só: ou some tudo, ou nada.
   * A ordem segue as FKs — lançamentos antes de contas, transferências e parcelamentos
   * que eles referenciam; tags, comprovantes, sessões, links de senha e histórico vão
   * por CASCADE. Devolve `false` se a conta já não existia.
   */
  deleteUser(userId: number): boolean {
    return this.db.transaction(() => {
      const statements = [
        'DELETE FROM transactions WHERE user_id = ?',
        'DELETE FROM transfers WHERE user_id = ?',
        'DELETE FROM installments WHERE user_id = ?',
        'DELETE FROM accounts WHERE user_id = ?',
        'DELETE FROM tags WHERE user_id = ?',
        'DELETE FROM categories WHERE user_id = ?',
        'DELETE FROM budgets WHERE user_id = ?',
        'DELETE FROM goals WHERE user_id = ?',
      ]
      for (const sql of statements) {
        this.db.prepare(sql).run(userId)
      }
      return this.db.prepare('DELETE FROM users WHERE id = ?').run(userId).changes > 0
    })()
  }
}
