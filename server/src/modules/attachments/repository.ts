import type { AppDatabase } from '../../db/connection.js'
import type { AttachmentMimeType } from './schemas.js'

export interface AttachmentMeta {
  transactionId: number
  mimeType: AttachmentMimeType
  sizeBytes: number
  uploadedAt: string
}

export interface Attachment extends AttachmentMeta {
  content: Buffer
}

interface AttachmentRow {
  transaction_id: number
  mime_type: AttachmentMimeType
  size_bytes: number
  created_at: string
  content?: Buffer
}

function toMeta(row: AttachmentRow): AttachmentMeta {
  return {
    transactionId: row.transaction_id,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.created_at,
  }
}

/**
 * O dono vem da transação: toda consulta cruza com `transactions.user_id`, então
 * o comprovante de outra conta não é lido, trocado nem apagado — a rota vê 404.
 */
export class AttachmentsRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Grava ou substitui o comprovante; `undefined` se a transação não é do usuário. */
  save(
    userId: number,
    transactionId: number,
    mimeType: AttachmentMimeType,
    content: Buffer,
  ): AttachmentMeta | undefined {
    // INSERT ... SELECT: a transação de outro usuário não casa e nada é gravado.
    const result = this.db
      .prepare(
        `INSERT INTO transaction_attachments (transaction_id, mime_type, size_bytes, content)
         SELECT id, ?, ?, ? FROM transactions WHERE id = ? AND user_id = ?
         ON CONFLICT (transaction_id) DO UPDATE SET
           mime_type = excluded.mime_type,
           size_bytes = excluded.size_bytes,
           content = excluded.content,
           created_at = datetime('now')`,
      )
      .run(mimeType, content.length, content, transactionId, userId)
    if (result.changes === 0) {
      return undefined
    }
    const row = this.db
      .prepare(
        `SELECT transaction_id, mime_type, size_bytes, created_at
         FROM transaction_attachments WHERE transaction_id = ?`,
      )
      .get(transactionId) as AttachmentRow
    return toMeta(row)
  }

  find(userId: number, transactionId: number): Attachment | undefined {
    const row = this.db
      .prepare(
        `SELECT a.transaction_id, a.mime_type, a.size_bytes, a.created_at, a.content
         FROM transaction_attachments a JOIN transactions t ON t.id = a.transaction_id
         WHERE a.transaction_id = ? AND t.user_id = ?`,
      )
      .get(transactionId, userId) as AttachmentRow | undefined
    return row?.content ? { ...toMeta(row), content: row.content } : undefined
  }

  delete(userId: number, transactionId: number): boolean {
    const result = this.db
      .prepare(
        `DELETE FROM transaction_attachments WHERE transaction_id = ?
         AND transaction_id IN (SELECT id FROM transactions WHERE user_id = ?)`,
      )
      .run(transactionId, userId)
    return result.changes > 0
  }
}
