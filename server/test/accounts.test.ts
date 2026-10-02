import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

const OWNER = { email: 'lucas@example.com', password: 'senha-forte-123' }
const OTHER = { email: 'maria@example.com', password: 'outra-senha-456' }

let app: FastifyInstance
let auth: string

/** Cria o usuário e devolve o header pronto: toda rota de conta exige token. */
async function registerAndAuthorize(credentials = OWNER): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: credentials,
  })
  return `Bearer ${response.json().token}`
}

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:', rateLimit: false })
  await app.ready()
  auth = await registerAndAuthorize()
})

afterEach(async () => {
  await app.close()
})

/** `app.inject` já autenticado como o dono padrão dos testes. */
async function inject(options: InjectOptions) {
  return app.inject({ ...options, headers: { authorization: auth, ...options.headers } })
}

async function createAccount(payload: Record<string, unknown>, as = auth) {
  return app.inject({
    method: 'POST',
    url: '/api/accounts',
    headers: { authorization: as },
    payload,
  })
}

async function createTransaction(payload: Record<string, unknown>, as = auth) {
  return app.inject({
    method: 'POST',
    url: '/api/transactions',
    headers: { authorization: as },
    payload: {
      type: 'expense',
      description: 'Mercado',
      amountCents: 10000,
      occurredOn: '2026-09-10',
      ...payload,
    },
  })
}

async function accountIdOf(name: string, openingBalanceCents = 0): Promise<number> {
  const response = await createAccount({ name, openingBalanceCents })
  expect(response.statusCode).toBe(201)
  return response.json().id as number
}

describe('POST /api/accounts', () => {
  it('cadastra conta com saldo inicial (inclusive negativo) e saldo atual igual a ele', async () => {
    const response = await createAccount({ name: '  Conta corrente ', openingBalanceCents: 150000 })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      name: 'Conta corrente',
      openingBalanceCents: 150000,
      balanceCents: 150000,
    })

    const card = await createAccount({ name: 'Cartão', openingBalanceCents: -32000 })
    expect(card.statusCode).toBe(201)
    expect(card.json().balanceCents).toBe(-32000)

    const noOpening = await createAccount({ name: 'Carteira' })
    expect(noOpening.json().openingBalanceCents).toBe(0)
  })

  it('rejeita nome vazio e saldo inicial fracionado (centavos são inteiros)', async () => {
    const badName = await createAccount({ name: '  ' })
    expect(badName.statusCode).toBe(400)
    expect(badName.json().issues[0].path).toBe('name')

    const badAmount = await createAccount({ name: 'Poupança', openingBalanceCents: 10.5 })
    expect(badAmount.statusCode).toBe(400)
    expect(badAmount.json().issues[0].path).toBe('openingBalanceCents')
  })

  it('responde 409 para nome repetido, sem diferenciar maiúsculas, só dentro do usuário', async () => {
    await createAccount({ name: 'Poupança' })
    const duplicate = await createAccount({ name: 'poupança' })
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json()).toEqual({ error: 'account_exists' })

    const other = await registerAndAuthorize(OTHER)
    expect((await createAccount({ name: 'Poupança' }, other)).statusCode).toBe(201)
  })
})

describe('GET /api/accounts', () => {
  it('lista em ordem alfabética com o saldo somando receitas e subtraindo despesas', async () => {
    const checking = await accountIdOf('Corrente', 100000)
    await accountIdOf('Carteira', 5000)
    await createTransaction({ type: 'income', amountCents: 500000, accountId: checking })
    await createTransaction({ type: 'expense', amountCents: 120000, accountId: checking })
    // Sem conta: não mexe no saldo de nenhuma.
    await createTransaction({ type: 'expense', amountCents: 999 })

    const response = await inject({ method: 'GET', url: '/api/accounts' })
    expect(response.statusCode).toBe(200)
    expect(
      response
        .json()
        .items.map((item: { name: string; balanceCents: number }) => [
          item.name,
          item.balanceCents,
        ]),
    ).toEqual([
      ['Carteira', 5000],
      ['Corrente', 480000],
    ])
  })

  it('não mostra contas de outro usuário', async () => {
    const other = await registerAndAuthorize(OTHER)
    await createAccount({ name: 'Conta da Maria' }, other)

    const response = await inject({ method: 'GET', url: '/api/accounts' })
    expect(response.json().items).toEqual([])
  })

  it('exige token', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/accounts' })
    expect(response.statusCode).toBe(401)
  })
})

describe('PUT /api/accounts/:id', () => {
  it('renomeia e ajusta o saldo inicial, recalculando o saldo atual', async () => {
    const id = await accountIdOf('Corrente', 1000)
    await createTransaction({ type: 'expense', amountCents: 300, accountId: id })

    const response = await inject({
      method: 'PUT',
      url: `/api/accounts/${id}`,
      payload: { name: 'Nubank', openingBalanceCents: 2000 },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ id, name: 'Nubank', balanceCents: 1700 })
  })

  it('responde 409 ao renomear para um nome já usado e 404 para conta de outro usuário', async () => {
    await accountIdOf('Corrente')
    const id = await accountIdOf('Poupança')
    const conflict = await inject({
      method: 'PUT',
      url: `/api/accounts/${id}`,
      payload: { name: 'corrente' },
    })
    expect(conflict.statusCode).toBe(409)

    const other = await registerAndAuthorize(OTHER)
    const foreign = await app.inject({
      method: 'PUT',
      url: `/api/accounts/${id}`,
      headers: { authorization: other },
      payload: { name: 'Roubada' },
    })
    expect(foreign.statusCode).toBe(404)
  })
})

describe('DELETE /api/accounts/:id', () => {
  it('remove a conta e mantém os lançamentos, agora sem conta', async () => {
    const id = await accountIdOf('Corrente')
    const transaction = await createTransaction({ accountId: id })

    const response = await inject({ method: 'DELETE', url: `/api/accounts/${id}` })
    expect(response.statusCode).toBe(204)

    const list = await inject({ method: 'GET', url: '/api/transactions?month=2026-09' })
    expect(list.json().items).toEqual([
      expect.objectContaining({ id: transaction.json().id, accountId: null }),
    ])
    expect((await inject({ method: 'GET', url: '/api/accounts' })).json().items).toEqual([])
  })

  it('responde 404 para conta inexistente ou de outro usuário', async () => {
    const id = await accountIdOf('Corrente')
    const other = await registerAndAuthorize(OTHER)
    const foreign = await app.inject({
      method: 'DELETE',
      url: `/api/accounts/${id}`,
      headers: { authorization: other },
    })
    expect(foreign.statusCode).toBe(404)
    expect((await inject({ method: 'DELETE', url: '/api/accounts/999' })).statusCode).toBe(404)
  })
})

describe('transações com conta', () => {
  it('grava a conta informada e devolve null quando omitida', async () => {
    const id = await accountIdOf('Corrente')
    expect((await createTransaction({ accountId: id })).json().accountId).toBe(id)
    expect((await createTransaction({})).json().accountId).toBeNull()
  })

  it('recusa conta de outro usuário com erro no campo accountId', async () => {
    const other = await registerAndAuthorize(OTHER)
    const foreignId = (await createAccount({ name: 'Conta da Maria' }, other)).json().id

    const response = await createTransaction({ accountId: foreignId })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: 'validation_error',
      issues: [{ path: 'accountId', message: 'conta não encontrada' }],
    })
  })

  it('na edição, omitir accountId mantém a conta e null explícito desvincula', async () => {
    const id = await accountIdOf('Corrente')
    const created = (await createTransaction({ accountId: id })).json()
    const body = {
      type: 'expense',
      description: 'Mercado editado',
      amountCents: 12000,
      occurredOn: '2026-09-10',
    }

    const kept = await inject({
      method: 'PUT',
      url: `/api/transactions/${created.id}`,
      payload: body,
    })
    expect(kept.statusCode).toBe(200)
    expect(kept.json()).toMatchObject({ description: 'Mercado editado', accountId: id })

    const unlinked = await inject({
      method: 'PUT',
      url: `/api/transactions/${created.id}`,
      payload: { ...body, accountId: null },
    })
    expect(unlinked.json().accountId).toBeNull()
  })

  it('recorrente gerada no boot do mês seguinte herda a conta da série', async () => {
    // A geração roda no boot: precisa de um banco em arquivo que sobreviva entre duas subidas.
    const dir = mkdtempSync(join(tmpdir(), 'finboard-accounts-'))
    const dbPath = join(dir, 'test.db')
    try {
      await app.close()
      app = await buildApp({ dbPath, rateLimit: false, recurringMonth: '2026-08' })
      await app.ready()
      auth = await registerAndAuthorize()
      const id = await accountIdOf('Corrente')
      await createTransaction({
        description: 'Aluguel',
        occurredOn: '2026-08-05',
        recurring: true,
        accountId: id,
      })
      await app.close()

      app = await buildApp({ dbPath, rateLimit: false, recurringMonth: '2026-09' })
      await app.ready()
      const response = await inject({ method: 'GET', url: '/api/transactions?month=2026-09' })
      expect(response.json().items).toEqual([
        expect.objectContaining({
          description: 'Aluguel',
          occurredOn: '2026-09-05',
          accountId: id,
        }),
      ])
    } finally {
      await app.close()
      rmSync(dir, { recursive: true, force: true })
      // O afterEach fecha `app` de novo: deixa uma instância válida para ele.
      app = await buildApp({ dbPath: ':memory:', rateLimit: false })
    }
  })
})

describe('saldo por conta no summary', () => {
  it('traz o saldo acumulado de cada conta até o fim do mês pedido', async () => {
    const checking = await accountIdOf('Corrente', 100000)
    const wallet = await accountIdOf('Carteira')
    await createTransaction({
      type: 'income',
      amountCents: 50000,
      occurredOn: '2026-08-05',
      accountId: checking,
    })
    await createTransaction({
      type: 'expense',
      amountCents: 20000,
      occurredOn: '2026-09-30',
      accountId: checking,
    })
    await createTransaction({
      type: 'expense',
      amountCents: 3000,
      occurredOn: '2026-09-02',
      accountId: wallet,
    })
    // Depois do mês: não entra no saldo de setembro.
    await createTransaction({
      type: 'expense',
      amountCents: 77700,
      occurredOn: '2026-10-01',
      accountId: checking,
    })

    const september = await inject({ method: 'GET', url: '/api/summary?month=2026-09' })
    expect(september.statusCode).toBe(200)
    expect(september.json().accounts).toEqual([
      { id: wallet, name: 'Carteira', balanceCents: -3000 },
      { id: checking, name: 'Corrente', balanceCents: 130000 },
    ])

    const august = await inject({ method: 'GET', url: '/api/summary?month=2026-08' })
    expect(august.json().accounts).toEqual([
      { id: wallet, name: 'Carteira', balanceCents: 0 },
      { id: checking, name: 'Corrente', balanceCents: 150000 },
    ])

    const allTime = await inject({ method: 'GET', url: '/api/summary' })
    expect(allTime.json().accounts).toContainEqual({
      id: checking,
      name: 'Corrente',
      balanceCents: 52300,
    })
  })

  it('devolve lista vazia para quem não usa contas', async () => {
    await createTransaction({})
    const response = await inject({ method: 'GET', url: '/api/summary?month=2026-09' })
    expect(response.json().accounts).toEqual([])
  })
})
