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

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: 'expense',
    description: 'Mercado',
    amountCents: 15990,
    category: 'alimentação',
    occurredOn: '2026-08-20',
    ...overrides,
  }
}

describe('GET /health', () => {
  it('responde ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })
})

describe('POST /api/transactions', () => {
  it('cria transação e devolve o registro com id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload(),
    })
    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body).toMatchObject({
      type: 'expense',
      description: 'Mercado',
      amountCents: 15990,
      category: 'alimentação',
      occurredOn: '2026-08-20',
    })
    expect(body.id).toBeGreaterThan(0)
    expect(body.createdAt).toBeTruthy()
  })

  it('aplica categoria padrão quando omitida', async () => {
    const payload = validPayload()
    delete (payload as Record<string, unknown>).category
    const response = await app.inject({ method: 'POST', url: '/api/transactions', payload })
    expect(response.statusCode).toBe(201)
    expect(response.json().category).toBe('geral')
  })

  it('rejeita payload inválido com 400 e detalhes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ amountCents: -5, occurredOn: '20/08/2026' }),
    })
    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error).toBe('validation_error')
    const paths = body.issues.map((issue: { path: string }) => issue.path)
    expect(paths).toContain('amountCents')
    expect(paths).toContain('occurredOn')
  })
})

describe('GET /api/transactions', () => {
  it('filtra por mês e ordena mais recente primeiro', async () => {
    for (const [description, occurredOn] of [
      ['julho', '2026-07-10'],
      ['agosto cedo', '2026-08-01'],
      ['agosto tarde', '2026-08-15'],
    ] as const) {
      await app.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: validPayload({ description, occurredOn }),
      })
    }

    const response = await app.inject({ method: 'GET', url: '/api/transactions?month=2026-08' })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toHaveLength(2)
    expect(body.map((t: { description: string }) => t.description)).toEqual([
      'agosto tarde',
      'agosto cedo',
    ])
  })

  it('rejeita mês mal formatado', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/transactions?month=agosto' })
    expect(response.statusCode).toBe(400)
  })
})

describe('PUT /api/transactions/:id', () => {
  it('atualiza todos os campos e devolve o registro atualizado', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload(),
    })
    const { id, createdAt } = created.json()

    const response = await app.inject({
      method: 'PUT',
      url: `/api/transactions/${id}`,
      payload: validPayload({
        type: 'income',
        description: 'Salário',
        amountCents: 500000,
        category: 'trabalho',
        occurredOn: '2026-08-05',
      }),
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      id,
      type: 'income',
      description: 'Salário',
      amountCents: 500000,
      category: 'trabalho',
      occurredOn: '2026-08-05',
      createdAt,
    })

    const summary = await app.inject({ method: 'GET', url: '/api/summary?month=2026-08' })
    expect(summary.json()).toEqual({
      incomeCents: 500000,
      expenseCents: 0,
      balanceCents: 500000,
    })
  })

  it('devolve 404 quando o id não existe', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/transactions/999',
      payload: validPayload(),
    })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'not_found' })
  })

  it('rejeita payload inválido com 400 sem alterar o registro', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload(),
    })
    const { id } = created.json()

    const response = await app.inject({
      method: 'PUT',
      url: `/api/transactions/${id}`,
      payload: validPayload({ amountCents: 0 }),
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('validation_error')

    const list = await app.inject({ method: 'GET', url: '/api/transactions?month=2026-08' })
    expect(list.json()[0].amountCents).toBe(15990)
  })
})

describe('DELETE /api/transactions/:id', () => {
  it('exclui transação existente e devolve 204', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload(),
    })
    const { id } = created.json()

    const response = await app.inject({ method: 'DELETE', url: `/api/transactions/${id}` })
    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')

    const list = await app.inject({ method: 'GET', url: '/api/transactions' })
    expect(list.json()).toHaveLength(0)
  })

  it('devolve 404 quando o id não existe', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/api/transactions/999' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'not_found' })
  })

  it('rejeita id não numérico com 400', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/api/transactions/abc' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('validation_error')
  })
})

describe('GET /api/summary', () => {
  it('calcula receitas, despesas e saldo do mês', async () => {
    const entries = [
      { type: 'income', amountCents: 500000, occurredOn: '2026-08-05' },
      { type: 'expense', amountCents: 120000, occurredOn: '2026-08-10' },
      { type: 'expense', amountCents: 30000, occurredOn: '2026-08-12' },
      { type: 'income', amountCents: 999900, occurredOn: '2026-07-01' },
    ]
    for (const entry of entries) {
      await app.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: validPayload(entry),
      })
    }

    const response = await app.inject({ method: 'GET', url: '/api/summary?month=2026-08' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      incomeCents: 500000,
      expenseCents: 150000,
      balanceCents: 350000,
    })
  })
})
