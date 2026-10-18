import { createHash, randomBytes } from 'node:crypto'
import type { AppDatabase } from '../../db/connection.js'

/** Janela do link de recuperação: curta, porque quem tem o e-mail aberto tem a conta. */
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000

export interface IssuedResetToken {
  /** Valor opaco que vai no link do e-mail — o banco guarda só o hash. */
  token: string
  expiresAt: string
}

interface ResetTokenRow {
  id: number
  user_id: number
  expires_at: string
  used_at: string | null
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export class PasswordResetRepository {
  constructor(private readonly db: AppDatabase) {}

  /**
   * Emite um link novo e invalida os anteriores ainda não usados: só o e-mail mais
   * recente funciona, então pedir de novo não deixa vários links válidos na caixa.
   */
  issue(userId: number, now: Date = new Date()): IssuedResetToken {
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS).toISOString()
    this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL')
        .run(userId)
      this.db
        .prepare(
          'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        )
        .run(userId, hashToken(token), expiresAt)
    })()
    return { token, expiresAt }
  }

  /**
   * Gasta o token e grava o hash da senha nova, numa transação só: dois envios do
   * mesmo link não trocam a senha duas vezes. Devolve o id do dono, ou `undefined`
   * se o token não existe, venceu ou já foi usado.
   */
  resetPassword(token: string, passwordHash: string, now: Date = new Date()): number | undefined {
    return this.db.transaction((): number | undefined => {
      const row = this.db
        .prepare(
          'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?',
        )
        .get(hashToken(token)) as ResetTokenRow | undefined
      const at = now.toISOString()
      if (!row || row.used_at || row.expires_at <= at) {
        return undefined
      }
      this.db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(at, row.id)
      this.db
        .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .run(passwordHash, row.user_id)
      return row.user_id
    })()
  }
}
