import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { AppDatabase } from '../../db/connection.js'

/** Quanto um refresh token vive sem ser usado; cada rotação emite outro com prazo cheio. */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface IssuedRefreshToken {
  /** Valor opaco entregue ao cliente — só existe aqui, o banco guarda o hash. */
  token: string
  expiresAt: string
}

/**
 * - `rotated`: token válido, trocado por um novo da mesma família.
 * - `reused`: token já trocado antes apareceu de novo — a família inteira é revogada.
 * - `invalid`: inexistente, expirado ou revogado.
 */
export type RotationResult =
  | { status: 'rotated'; userId: number; refreshToken: IssuedRefreshToken }
  | { status: 'reused' }
  | { status: 'invalid' }

interface RefreshTokenRow {
  id: number
  user_id: number
  family_id: string
  expires_at: string
  used_at: string | null
  revoked_at: string | null
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export class RefreshTokensRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Sem `familyId` abre uma família nova: é um login (um dispositivo a mais). */
  issue(
    userId: number,
    now: Date = new Date(),
    familyId: string = randomUUID(),
  ): IssuedRefreshToken {
    // 32 bytes aleatórios: não dá para adivinhar, então o SHA-256 sem salt basta (não é senha).
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS).toISOString()
    this.db
      .prepare(
        'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(userId, hashToken(token), familyId, expiresAt)
    return { token, expiresAt }
  }

  /**
   * Troca o token por um novo, uma vez só. Tudo numa transação: dois pedidos com o
   * mesmo token não conseguem rotacionar os dois — o segundo cai como reuso.
   */
  rotate(token: string, now: Date = new Date()): RotationResult {
    return this.db.transaction((): RotationResult => {
      const row = this.findByToken(token)
      if (!row || row.revoked_at) {
        return { status: 'invalid' }
      }
      const at = now.toISOString()
      if (row.used_at) {
        // Alguém tem uma cópia antiga: não dá para saber se é o dono ou o ladrão,
        // então o dispositivo inteiro sai e o dono entra de novo com a senha.
        this.revokeFamily(row.family_id, at)
        return { status: 'reused' }
      }
      if (row.expires_at <= at) {
        return { status: 'invalid' }
      }
      this.db.prepare('UPDATE refresh_tokens SET used_at = ? WHERE id = ?').run(at, row.id)
      return {
        status: 'rotated',
        userId: row.user_id,
        refreshToken: this.issue(row.user_id, now, row.family_id),
      }
    })()
  }

  /** Logout de um dispositivo: derruba a família do token. Token desconhecido não é erro. */
  revoke(token: string, now: Date = new Date()): void {
    const row = this.findByToken(token)
    if (row) {
      this.revokeFamily(row.family_id, now.toISOString())
    }
  }

  /** Logout de todos os dispositivos. Devolve quantas sessões estavam ativas. */
  revokeAllForUser(userId: number, now: Date = new Date()): number {
    const at = now.toISOString()
    const result = this.db
      .prepare(
        `UPDATE refresh_tokens SET revoked_at = ?
          WHERE user_id = ? AND revoked_at IS NULL AND used_at IS NULL AND expires_at > ?`,
      )
      .run(at, userId, at)
    // Os já trocados ou vencidos também ficam revogados, sem entrar na contagem.
    this.db
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(at, userId)
    return result.changes
  }

  private findByToken(token: string): RefreshTokenRow | undefined {
    return this.db
      .prepare(
        'SELECT id, user_id, family_id, expires_at, used_at, revoked_at FROM refresh_tokens WHERE token_hash = ?',
      )
      .get(hashToken(token)) as RefreshTokenRow | undefined
  }

  private revokeFamily(familyId: string, at: string): void {
    this.db
      .prepare(
        'UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL',
      )
      .run(at, familyId)
  }
}
