import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { openDatabase, type AppDatabase } from '../src/db/connection.js'
import {
  REFRESH_TOKEN_TTL_MS,
  RefreshTokensRepository,
} from '../src/modules/auth/refresh-tokens.js'
import { UsersRepository } from '../src/modules/auth/repository.js'

let app: FastifyInstance

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:', rateLimit: false })
  await app.ready()
})

afterEach(async () => {
  await app.close()
})

interface Session {
  user: { id: number; email: string }
  token: string
  refreshToken: string
}

const credentials = { email: 'lucas@example.com', password: 'senha-forte-123' }

async function register(): Promise<Session> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: credentials,
  })
  return response.json()
}

async function login(): Promise<Session> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: credentials,
  })
  return response.json()
}

async function refresh(refreshToken: unknown) {
  return app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken } })
}

describe('sessão com refresh token', () => {
  it('registro e login devolvem um refresh token opaco além do JWT', async () => {
    const registered = await register()
    const loggedIn = await login()

    for (const session of [registered, loggedIn]) {
      expect(session.token.split('.')).toHaveLength(3)
      expect(session.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    }
    expect(loggedIn.refreshToken).not.toBe(registered.refreshToken)
  })

  it('emite JWT de 15 minutos', async () => {
    const { token } = await register()
    const { exp, iat } = app.jwt.decode<{ exp: number; iat: number }>(token) ?? {
      exp: 0,
      iat: 0,
    }
    expect(exp - iat).toBe(15 * 60)
  })
})

describe('POST /api/auth/refresh', () => {
  it('troca o refresh token por um par novo que autentica', async () => {
    const session = await register()

    const response = await refresh(session.refreshToken)
    expect(response.statusCode).toBe(200)
    const renewed: Session = response.json()
    expect(renewed.user).toEqual(session.user)
    expect(renewed.refreshToken).not.toBe(session.refreshToken)

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${renewed.token}` },
    })
    expect(me.statusCode).toBe(200)

    // O novo também roda: a cadeia continua enquanto o dispositivo estiver ativo.
    expect((await refresh(renewed.refreshToken)).statusCode).toBe(200)
  })

  it('reuso de token já trocado derruba a sessão inteira daquele dispositivo', async () => {
    const session = await register()
    const renewed: Session = (await refresh(session.refreshToken)).json()

    const replay = await refresh(session.refreshToken)
    expect(replay.statusCode).toBe(401)
    expect(replay.json()).toEqual({ error: 'invalid_refresh_token' })

    // O token legítimo da mesma família também morreu: quem roubou não continua.
    expect((await refresh(renewed.refreshToken)).statusCode).toBe(401)
  })

  it('reuso num dispositivo não afeta a sessão de outro', async () => {
    const phone = await register()
    const laptop = await login()

    await refresh(phone.refreshToken)
    await refresh(phone.refreshToken)

    expect((await refresh(laptop.refreshToken)).statusCode).toBe(200)
  })

  it('recusa token desconhecido com 401 e corpo malformado com 400', async () => {
    const unknown = await refresh('nao-existe')
    expect(unknown.statusCode).toBe(401)
    expect(unknown.json()).toEqual({ error: 'invalid_refresh_token' })

    const missing = await app.inject({ method: 'POST', url: '/api/auth/refresh', payload: {} })
    expect(missing.statusCode).toBe(400)
    expect(missing.json().issues[0].path).toBe('refreshToken')

    expect((await refresh('x'.repeat(257))).statusCode).toBe(400)
  })
})

describe('POST /api/auth/logout', () => {
  it('revoga só a sessão deste dispositivo, sem exigir JWT', async () => {
    const phone = await register()
    const laptop = await login()

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      payload: { refreshToken: phone.refreshToken },
    })
    expect(response.statusCode).toBe(204)

    expect((await refresh(phone.refreshToken)).statusCode).toBe(401)
    expect((await refresh(laptop.refreshToken)).statusCode).toBe(200)
  })

  it('revoga também as rotações já emitidas a partir do token', async () => {
    const session = await register()
    const renewed: Session = (await refresh(session.refreshToken)).json()

    // Logout com o token antigo (ex.: outra aba que ainda não viu a rotação).
    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      payload: { refreshToken: session.refreshToken },
    })

    expect((await refresh(renewed.refreshToken)).statusCode).toBe(401)
  })

  it('é idempotente: token desconhecido também responde 204', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      payload: { refreshToken: 'nao-existe' },
    })
    expect(response.statusCode).toBe(204)
  })
})

describe('POST /api/auth/logout-all', () => {
  it('revoga todas as sessões da conta e devolve quantas eram', async () => {
    const phone = await register()
    const laptop = await login()
    const tablet = await login()
    // Uma rotação não conta como sessão a mais: continua sendo o mesmo dispositivo.
    const renewedTablet: Session = (await refresh(tablet.refreshToken)).json()

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout-all',
      headers: { authorization: `Bearer ${phone.token}` },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ revokedSessions: 3 })

    for (const refreshToken of [
      phone.refreshToken,
      laptop.refreshToken,
      renewedTablet.refreshToken,
    ]) {
      expect((await refresh(refreshToken)).statusCode).toBe(401)
    }

    // Senha continua valendo: o usuário entra de novo normalmente.
    expect((await refresh((await login()).refreshToken)).statusCode).toBe(200)
  })

  it('não mexe nas sessões de outra conta', async () => {
    const lucas = await register()
    const other: Session = (
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'outra@example.com', password: 'senha-forte-456' },
      })
    ).json()

    await app.inject({
      method: 'POST',
      url: '/api/auth/logout-all',
      headers: { authorization: `Bearer ${lucas.token}` },
    })

    expect((await refresh(other.refreshToken)).statusCode).toBe(200)
  })

  it('exige JWT', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/logout-all' })
    expect(response.statusCode).toBe(401)
  })
})

describe('RefreshTokensRepository', () => {
  let db: AppDatabase
  let repository: RefreshTokensRepository
  let userId: number

  beforeEach(() => {
    db = openDatabase(':memory:')
    repository = new RefreshTokensRepository(db)
    userId = new UsersRepository(db).create('lucas@example.com', 'hash')?.id ?? 0
  })

  afterEach(() => {
    db.close()
  })

  it('guarda só o hash do token', () => {
    const { token } = repository.issue(userId)
    const rows = db.prepare('SELECT token_hash FROM refresh_tokens').all() as Array<{
      token_hash: string
    }>
    expect(rows).toHaveLength(1)
    expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(rows[0]?.token_hash).not.toContain(token)
  })

  it('recusa token vencido e aceita até o último instante', () => {
    const issuedAt = new Date('2026-10-01T12:00:00Z')
    const { token, expiresAt } = repository.issue(userId, issuedAt)
    expect(expiresAt).toBe(new Date(issuedAt.getTime() + REFRESH_TOKEN_TTL_MS).toISOString())

    const almost = new Date(issuedAt.getTime() + REFRESH_TOKEN_TTL_MS - 1)
    const stillValid = repository.rotate(token, almost)
    expect(stillValid.status).toBe('rotated')

    const expired = repository.issue(userId, issuedAt)
    const atDeadline = new Date(issuedAt.getTime() + REFRESH_TOKEN_TTL_MS)
    expect(repository.rotate(expired.token, atDeadline)).toEqual({ status: 'invalid' })
  })

  it('cada rotação renova o prazo cheio', () => {
    const issuedAt = new Date('2026-10-01T12:00:00Z')
    const { token } = repository.issue(userId, issuedAt)
    const later = new Date('2026-10-20T12:00:00Z')

    const rotation = repository.rotate(token, later)
    expect(rotation.status === 'rotated' && rotation.refreshToken.expiresAt).toBe(
      new Date(later.getTime() + REFRESH_TOKEN_TTL_MS).toISOString(),
    )
  })

  it('apaga os tokens junto com a conta', () => {
    repository.issue(userId)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId)
    expect(db.prepare('SELECT COUNT(*) AS n FROM refresh_tokens').get()).toEqual({ n: 0 })
  })
})
