import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import type { MailMessage } from '../src/mail/mailer.js'

const OWNER = { email: 'lucas@example.com', password: 'senha-forte-123' }
const OTHER = { email: 'maria@example.com', password: 'outra-senha-456' }

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('comprovante')])

let app: FastifyInstance
let sent: MailMessage[]

beforeEach(async () => {
  sent = []
  app = await buildApp({
    dbPath: ':memory:',
    rateLimit: false,
    mailer: {
      send(message) {
        sent.push(message)
        return Promise.resolve()
      },
    },
  })
  await app.ready()
})

afterEach(async () => {
  await app.close()
})

interface Session {
  auth: string
  refreshToken: string
}

async function register(credentials: typeof OWNER): Promise<Session> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: credentials,
  })
  const body = response.json()
  return { auth: `Bearer ${body.token}`, refreshToken: body.refreshToken }
}

async function inject(options: InjectOptions, auth: string) {
  return app.inject({ ...options, headers: { authorization: auth, ...options.headers } })
}

/** Uma conta com um pouco de tudo: cada tabela com dono ganha ao menos uma linha. */
async function seedEverything(auth: string) {
  const wallet = (
    await inject(
      {
        method: 'POST',
        url: '/api/accounts',
        payload: { name: 'Carteira', openingBalanceCents: 1000 },
      },
      auth,
    )
  ).json().id as number
  const bank = (
    await inject({ method: 'POST', url: '/api/accounts', payload: { name: 'Banco' } }, auth)
  ).json().id as number
  await inject(
    {
      method: 'POST',
      url: '/api/categories/catalog',
      payload: { name: 'saúde', color: '#ff0000' },
    },
    auth,
  )
  const transaction = (
    await inject(
      {
        method: 'POST',
        url: '/api/transactions',
        payload: {
          type: 'expense',
          description: 'Farmácia',
          amountCents: 4590,
          category: 'saúde',
          occurredOn: '2026-10-14',
          accountId: wallet,
          tags: ['remédio', 'família'],
        },
      },
      auth,
    )
  ).json().id as number
  await inject(
    {
      method: 'PUT',
      url: `/api/transactions/${transaction}/attachment`,
      headers: { 'content-type': 'image/png' },
      payload: PNG,
    },
    auth,
  )
  await inject(
    {
      method: 'POST',
      url: '/api/transfers',
      payload: {
        fromAccountId: bank,
        toAccountId: wallet,
        amountCents: 20000,
        occurredOn: '2026-10-10',
      },
    },
    auth,
  )
  await inject(
    {
      method: 'POST',
      url: '/api/installments',
      payload: {
        description: 'Notebook',
        totalCents: 300000,
        installmentCount: 3,
        firstDueOn: '2026-11-05',
      },
    },
    auth,
  )
  await inject({ method: 'PUT', url: '/api/budgets/saúde', payload: { amountCents: 50000 } }, auth)
  await inject(
    { method: 'POST', url: '/api/goals', payload: { name: 'Viagem', targetCents: 500000 } },
    auth,
  )
  return { transaction, wallet }
}

function deleteAccount(auth: string, password: string) {
  return inject({ method: 'DELETE', url: '/api/auth/me', payload: { password } }, auth)
}

describe('GET /api/auth/me/export', () => {
  it('exige token', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/me/export' })
    expect(response.statusCode).toBe(401)
  })

  it('baixa um JSON com todos os dados da conta, sem senha nem token', async () => {
    const { auth, refreshToken } = await register(OWNER)
    const { transaction, wallet } = await seedEverything(auth)

    const response = await inject({ method: 'GET', url: '/api/auth/me/export' }, auth)

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="finboard-meus-dados-\d{4}-\d{2}-\d{2}\.json"$/,
    )
    expect(response.headers['cache-control']).toBe('private, no-store')

    const data = response.json()
    expect(data).toMatchObject({ format: 'finboard-export', version: 1 })
    expect(data.user).toMatchObject({ email: OWNER.email })
    expect(data.accounts.map((account: { name: string }) => account.name).sort()).toEqual([
      'Banco',
      'Carteira',
    ])
    expect(data.categories).toEqual([expect.objectContaining({ name: 'saúde', color: '#ff0000' })])
    // 1 avulsa + 2 pernas da transferência + 3 parcelas.
    expect(data.transactions).toHaveLength(6)
    expect(data.transactions).toContainEqual(
      expect.objectContaining({
        id: transaction,
        amountCents: 4590,
        accountId: wallet,
        tags: ['família', 'remédio'],
      }),
    )
    expect(data.attachments).toEqual([
      expect.objectContaining({
        transactionId: transaction,
        mimeType: 'image/png',
        contentBase64: PNG.toString('base64'),
      }),
    ])
    expect(data.transfers).toHaveLength(1)
    expect(data.installments).toEqual([
      expect.objectContaining({ description: 'Notebook', totalCents: 300000, installmentCount: 3 }),
    ])
    expect(data.budgets).toEqual([
      expect.objectContaining({ category: 'saúde', amountCents: 50000 }),
    ])
    expect(data.goals).toEqual([expect.objectContaining({ name: 'Viagem', targetCents: 500000 })])
    expect(data.history).toContainEqual(
      expect.objectContaining({ transactionId: transaction, action: 'created' }),
    )

    expect(response.body).not.toContain(OWNER.password)
    expect(response.body).not.toContain('argon2')
    expect(response.body).not.toContain(refreshToken)
  })

  it('não leva nada de outra conta', async () => {
    const owner = await register(OWNER)
    const other = await register(OTHER)
    await seedEverything(other.auth)

    const data = (await inject({ method: 'GET', url: '/api/auth/me/export' }, owner.auth)).json()

    expect(data.user.email).toBe(OWNER.email)
    for (const key of [
      'accounts',
      'categories',
      'transactions',
      'attachments',
      'transfers',
      'installments',
      'budgets',
      'goals',
      'history',
    ]) {
      expect(data[key], key).toEqual([])
    }
  })
})

describe('DELETE /api/auth/me', () => {
  it('recusa senha errada com 403 e não apaga nada', async () => {
    const { auth } = await register(OWNER)
    await seedEverything(auth)

    const response = await deleteAccount(auth, 'senha-errada-000')

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'invalid_password' })
    const me = await inject({ method: 'GET', url: '/api/auth/me' }, auth)
    expect(me.statusCode).toBe(200)
    const exported = (await inject({ method: 'GET', url: '/api/auth/me/export' }, auth)).json()
    expect(exported.transactions).toHaveLength(6)
  })

  it('exige a senha no corpo e um token', async () => {
    const { auth } = await register(OWNER)
    const missing = await inject({ method: 'DELETE', url: '/api/auth/me', payload: {} }, auth)
    expect(missing.statusCode).toBe(400)

    const anonymous = await app.inject({
      method: 'DELETE',
      url: '/api/auth/me',
      payload: { password: OWNER.password },
    })
    expect(anonymous.statusCode).toBe(401)
  })

  it('apaga a conta com tudo dentro, derruba as sessões e libera o e-mail', async () => {
    const { auth, refreshToken } = await register(OWNER)
    await seedEverything(auth)

    const response = await deleteAccount(auth, OWNER.password)
    expect(response.statusCode).toBe(204)

    // JWT ainda dentro dos 15 minutos já não autentica ninguém.
    expect((await inject({ method: 'GET', url: '/api/auth/me' }, auth)).statusCode).toBe(401)
    expect((await inject({ method: 'GET', url: '/api/auth/me/export' }, auth)).statusCode).toBe(401)
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken },
    })
    expect(refresh.statusCode).toBe(401)
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: OWNER })
    expect(login.statusCode).toBe(401)

    // Recadastrar com o mesmo e-mail começa do zero: nada da conta antiga reaparece.
    const fresh = await register(OWNER)
    const data = (await inject({ method: 'GET', url: '/api/auth/me/export' }, fresh.auth)).json()
    expect(data.transactions).toEqual([])
    expect(data.accounts).toEqual([])
    expect(data.history).toEqual([])
    expect(data.attachments).toEqual([])
  })

  it('apaga também os links de recuperação de senha pendentes', async () => {
    const { auth } = await register(OWNER)
    await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: OWNER.email },
    })
    const token = /#reset=([\w-]+)/.exec(sent[0]?.text ?? '')?.[1]
    expect(token).toBeDefined()

    await deleteAccount(auth, OWNER.password)
    await register(OWNER)

    const reset = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, password: 'nova-senha-789' },
    })
    expect(reset.statusCode).toBe(400)
  })

  it('não toca nos dados de outra conta', async () => {
    const owner = await register(OWNER)
    const other = await register(OTHER)
    await seedEverything(owner.auth)
    await seedEverything(other.auth)

    await deleteAccount(owner.auth, OWNER.password)

    const data = (await inject({ method: 'GET', url: '/api/auth/me/export' }, other.auth)).json()
    expect(data.transactions).toHaveLength(6)
    expect(data.attachments).toHaveLength(1)
    expect(data.goals).toHaveLength(1)
  })
})
