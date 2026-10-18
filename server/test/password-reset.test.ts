import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { openDatabase, type AppDatabase } from '../src/db/connection.js'
import type { MailMessage, Mailer } from '../src/mail/mailer.js'
import { buildPasswordResetEmail, escapeHtml } from '../src/mail/password-reset-email.js'
import {
  PASSWORD_RESET_TTL_MS,
  PasswordResetRepository,
} from '../src/modules/auth/password-reset.js'
import { UsersRepository } from '../src/modules/auth/repository.js'

let app: FastifyInstance
let outbox: MailMessage[]

const memoryMailer: Mailer = {
  send(message) {
    outbox.push(message)
    return Promise.resolve()
  },
}

beforeEach(async () => {
  outbox = []
  app = await buildApp({
    dbPath: ':memory:',
    rateLimit: false,
    mailer: memoryMailer,
    appUrl: 'https://finboard.example/',
  })
  await app.ready()
})

afterEach(async () => {
  await app.close()
})

const credentials = { email: 'lucas@example.com', password: 'senha-forte-123' }

async function register() {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: credentials,
  })
  return response.json() as { token: string; refreshToken: string }
}

async function forgot(email: unknown) {
  return app.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email } })
}

async function reset(token: unknown, password: unknown) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/reset-password',
    payload: { token, password },
  })
}

async function login(password: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: credentials.email, password },
  })
}

/** O token só existe no link do e-mail: o teste lê de lá, como o usuário faria. */
function tokenFrom(message: MailMessage | undefined): string {
  const token = /#reset=([A-Za-z0-9_-]+)/.exec(message?.text ?? '')?.[1]
  if (!token) throw new Error('e-mail sem link de recuperação')
  return token
}

describe('POST /api/auth/forgot-password', () => {
  it('manda o e-mail pt-BR com link para o SPA e o token no fragmento', async () => {
    await register()

    const response = await forgot('  Lucas@Example.com ')

    expect(response.statusCode).toBe(202)
    expect(response.body).toBe('')
    expect(outbox).toHaveLength(1)
    const [message] = outbox
    expect(message?.to).toBe('lucas@example.com')
    expect(message?.subject).toBe('Finboard: redefinição de senha')
    expect(message?.text).toMatch(/^https:\/\/finboard\.example\/#reset=[A-Za-z0-9_-]{43}$/m)
    expect(message?.text).toContain('vale por 30 minutos')
    expect(message?.html).toContain('<html lang="pt-BR">')
    expect(message?.html).toContain(`#reset=${tokenFrom(message)}`)
  })

  it('responde igual para e-mail sem conta, sem mandar nada', async () => {
    const response = await forgot('ninguem@example.com')

    expect(response.statusCode).toBe(202)
    expect(response.body).toBe('')
    expect(outbox).toHaveLength(0)
  })

  it('recusa e-mail mal formado com 400', async () => {
    const response = await forgot('nao-e-email')

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('validation_error')
  })

  it('falha do provedor de e-mail não vira erro para o cliente', async () => {
    await app.close()
    app = await buildApp({
      dbPath: ':memory:',
      rateLimit: false,
      mailer: { send: () => Promise.reject(new Error('SMTP fora do ar')) },
    })
    await register()

    const response = await forgot(credentials.email)

    expect(response.statusCode).toBe(202)
  })
})

describe('POST /api/auth/reset-password', () => {
  it('troca a senha: a nova entra, a antiga não', async () => {
    await register()
    await forgot(credentials.email)

    const response = await reset(tokenFrom(outbox[0]), 'senha-nova-456')

    expect(response.statusCode).toBe(204)
    expect((await login('senha-nova-456')).statusCode).toBe(200)
    expect((await login(credentials.password)).statusCode).toBe(401)
  })

  it('encerra as sessões abertas antes da troca', async () => {
    const session = await register()
    await forgot(credentials.email)

    await reset(tokenFrom(outbox[0]), 'senha-nova-456')
    const refreshed = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    })

    expect(refreshed.statusCode).toBe(401)
  })

  it('o link é de uso único', async () => {
    await register()
    await forgot(credentials.email)
    const token = tokenFrom(outbox[0])

    expect((await reset(token, 'senha-nova-456')).statusCode).toBe(204)
    const again = await reset(token, 'outra-senha-789')

    expect(again.statusCode).toBe(400)
    expect(again.json()).toEqual({ error: 'invalid_reset_token' })
    expect((await login('senha-nova-456')).statusCode).toBe(200)
  })

  it('um pedido novo invalida o link anterior', async () => {
    await register()
    await forgot(credentials.email)
    await forgot(credentials.email)
    const [first, second] = outbox

    expect((await reset(tokenFrom(first), 'senha-nova-456')).statusCode).toBe(400)
    expect((await reset(tokenFrom(second), 'senha-nova-456')).statusCode).toBe(204)
  })

  it('token desconhecido é 400 e não muda senha nenhuma', async () => {
    await register()

    const response = await reset('token-inventado', 'senha-nova-456')

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('invalid_reset_token')
    expect((await login(credentials.password)).statusCode).toBe(200)
  })

  it('aplica a política de senha do cadastro', async () => {
    await register()
    await forgot(credentials.email)

    const response = await reset(tokenFrom(outbox[0]), 'curta')

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('validation_error')
    // Senha recusada não gasta o link: dá para tentar de novo com uma válida.
    expect((await reset(tokenFrom(outbox[0]), 'senha-nova-456')).statusCode).toBe(204)
  })
})

describe('PasswordResetRepository', () => {
  let db: AppDatabase
  let userId: number

  beforeEach(() => {
    db = openDatabase(':memory:')
    userId = new UsersRepository(db).create('lucas@example.com', 'hash-antigo')!.id
  })

  afterEach(() => {
    db.close()
  })

  const passwordHashOf = (id: number) =>
    (
      db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id) as {
        password_hash: string
      }
    ).password_hash

  it('guarda só o hash do token, nunca o valor do link', () => {
    const { token } = new PasswordResetRepository(db).issue(userId)

    const stored = db.prepare('SELECT token_hash FROM password_reset_tokens').all() as Array<{
      token_hash: string
    }>
    expect(stored).toHaveLength(1)
    expect(stored[0]?.token_hash).not.toBe(token)
    expect(stored[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('token vencido não troca a senha', () => {
    const resets = new PasswordResetRepository(db)
    const issuedAt = new Date('2026-10-18T12:00:00Z')
    const { token, expiresAt } = resets.issue(userId, issuedAt)

    expect(expiresAt).toBe(new Date(issuedAt.getTime() + PASSWORD_RESET_TTL_MS).toISOString())
    expect(resets.resetPassword(token, 'hash-novo', new Date(expiresAt))).toBeUndefined()
    expect(passwordHashOf(userId)).toBe('hash-antigo')
  })

  it('dentro do prazo troca a senha e devolve o dono', () => {
    const resets = new PasswordResetRepository(db)
    const issuedAt = new Date('2026-10-18T12:00:00Z')
    const { token } = resets.issue(userId, issuedAt)

    const owner = resets.resetPassword(token, 'hash-novo', new Date('2026-10-18T12:29:59Z'))

    expect(owner).toBe(userId)
    expect(passwordHashOf(userId)).toBe('hash-novo')
  })
})

describe('template do e-mail de recuperação', () => {
  it('escapa o que entra no HTML', () => {
    const message = buildPasswordResetEmail({
      to: '"><script>alert(1)</script>@example.com',
      link: 'https://finboard.example/#reset=abc&x=<y>',
      expiresInMinutes: 30,
    })

    expect(message.html).not.toContain('<script>')
    expect(message.html).toContain('&lt;script&gt;')
    expect(message.html).toContain('#reset=abc&amp;x=&lt;y&gt;')
    // O texto puro não é HTML: vai sem escape.
    expect(message.text).toContain('https://finboard.example/#reset=abc&x=<y>')
  })

  it('escapeHtml cobre os cinco caracteres especiais', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})
