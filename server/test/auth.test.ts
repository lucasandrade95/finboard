import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

let app: FastifyInstance

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' })
  await app.ready()
})

afterEach(async () => {
  await app.close()
})

async function register(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/auth/register', payload })
}

async function login(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload })
}

async function me(authorization?: string) {
  return app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: authorization ? { authorization } : {},
  })
}

describe('POST /api/auth/register', () => {
  it('cria usuário e devolve token, sem expor a senha', async () => {
    const response = await register({ email: 'lucas@example.com', password: 'senha-forte-123' })
    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.user).toMatchObject({ email: 'lucas@example.com' })
    expect(body.user.id).toBeTypeOf('number')
    expect(body.token).toBeTypeOf('string')
    expect(response.body).not.toContain('senha-forte-123')
    expect(body.user).not.toHaveProperty('passwordHash')
  })

  it('normaliza o e-mail e recusa duplicado mesmo com outra caixa', async () => {
    const first = await register({ email: '  Lucas@Example.COM ', password: 'senha-forte-123' })
    expect(first.json().user.email).toBe('lucas@example.com')

    const duplicate = await register({ email: 'lucas@example.com', password: 'outra-senha-456' })
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json()).toEqual({ error: 'email_taken' })
  })

  it('rejeita e-mail inválido e senha curta', async () => {
    const badEmail = await register({ email: 'nao-e-email', password: 'senha-forte-123' })
    expect(badEmail.statusCode).toBe(400)
    expect(badEmail.json().error).toBe('validation_error')

    const shortPassword = await register({ email: 'lucas@example.com', password: '1234567' })
    expect(shortPassword.statusCode).toBe(400)
    expect(shortPassword.json().issues[0].path).toBe('password')
  })

  it('grava a senha como hash argon2id, nunca em texto puro', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'finboard-auth-'))
    const dbPath = join(dir, 'test.db')
    try {
      const fileApp = await buildApp({ dbPath })
      await fileApp.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'lucas@example.com', password: 'senha-forte-123' },
      })
      await fileApp.close()

      const db = new Database(dbPath, { readonly: true })
      const row = db.prepare('SELECT password_hash FROM users').get() as { password_hash: string }
      db.close()
      expect(row.password_hash).toMatch(/^\$argon2id\$/)
      expect(row.password_hash).not.toContain('senha-forte-123')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await register({ email: 'lucas@example.com', password: 'senha-forte-123' })
  })

  it('autentica com credenciais corretas (e-mail sem diferenciar caixa)', async () => {
    const response = await login({ email: 'LUCAS@example.com', password: 'senha-forte-123' })
    expect(response.statusCode).toBe(200)
    expect(response.json().user.email).toBe('lucas@example.com')
    expect(response.json().token).toBeTypeOf('string')
  })

  it('devolve o mesmo 401 para senha errada e e-mail inexistente', async () => {
    const wrongPassword = await login({ email: 'lucas@example.com', password: 'senha-errada' })
    const unknownEmail = await login({ email: 'ninguem@example.com', password: 'senha-forte-123' })

    expect(wrongPassword.statusCode).toBe(401)
    expect(unknownEmail.statusCode).toBe(401)
    expect(wrongPassword.json()).toEqual({ error: 'invalid_credentials' })
    expect(unknownEmail.json()).toEqual(wrongPassword.json())
  })

  it('não aplica a política de tamanho de senha no login', async () => {
    const response = await login({ email: 'lucas@example.com', password: 'curta' })
    expect(response.statusCode).toBe(401)
  })
})

describe('GET /api/auth/me', () => {
  it('devolve o usuário dono do token', async () => {
    const { token, user } = (
      await register({ email: 'lucas@example.com', password: 'senha-forte-123' })
    ).json()

    const response = await me(`Bearer ${token}`)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ user })
  })

  it('aceita o token emitido no login', async () => {
    await register({ email: 'lucas@example.com', password: 'senha-forte-123' })
    const { token } = (
      await login({ email: 'lucas@example.com', password: 'senha-forte-123' })
    ).json()

    const response = await me(`Bearer ${token}`)
    expect(response.statusCode).toBe(200)
  })

  it('recusa requisição sem token, token adulterado e token de outro segredo', async () => {
    const { token } = (
      await register({ email: 'lucas@example.com', password: 'senha-forte-123' })
    ).json()

    const missing = await me()
    expect(missing.statusCode).toBe(401)
    expect(missing.json()).toEqual({ error: 'unauthorized' })

    const tampered = await me(`Bearer ${token.slice(0, -2)}xx`)
    expect(tampered.statusCode).toBe(401)

    const otherApp = await buildApp({ dbPath: ':memory:', jwtSecret: 'outro-segredo' })
    const foreignToken = otherApp.jwt.sign({ sub: '1', email: 'lucas@example.com' })
    await otherApp.close()
    const foreign = await me(`Bearer ${foreignToken}`)
    expect(foreign.statusCode).toBe(401)
  })

  it('recusa token válido de usuário que não existe', async () => {
    const token = app.jwt.sign({ sub: '999', email: 'fantasma@example.com' })
    const response = await me(`Bearer ${token}`)
    expect(response.statusCode).toBe(401)
  })
})
