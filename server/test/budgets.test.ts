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

async function setBudget(category: string, amountCents: number) {
  return app.inject({
    method: 'PUT',
    url: `/api/budgets/${encodeURIComponent(category)}`,
    payload: { amountCents },
  })
}

async function addExpense(category: string, amountCents: number, occurredOn: string) {
  return app.inject({
    method: 'POST',
    url: '/api/transactions',
    payload: { type: 'expense', description: 'gasto', amountCents, category, occurredOn },
  })
}

describe('PUT /api/budgets/:category', () => {
  it('cria orçamento e devolve categoria com valor', async () => {
    const response = await setBudget('mercado', 80000)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ category: 'mercado', amountCents: 80000 })
  })

  it('atualiza orçamento existente (upsert)', async () => {
    await setBudget('mercado', 80000)
    await setBudget('mercado', 95000)

    const response = await app.inject({ method: 'GET', url: '/api/budgets?month=2026-08' })
    expect(response.json().items).toEqual([
      { category: 'mercado', budgetCents: 95000, spentCents: 0 },
    ])
  })

  it('rejeita valor não positivo com 400', async () => {
    const response = await setBudget('mercado', 0)
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('validation_error')
  })
})

describe('GET /api/budgets', () => {
  it('exige mês no formato YYYY-MM', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/budgets' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('validation_error')
  })

  it('soma só as despesas da categoria no mês pedido', async () => {
    await setBudget('mercado', 80000)
    await addExpense('mercado', 30000, '2026-08-05')
    await addExpense('mercado', 20000, '2026-08-20')
    await addExpense('mercado', 99999, '2026-07-10') // outro mês: fora
    await addExpense('transporte', 5000, '2026-08-12') // outra categoria: fora
    // Receita na categoria não conta como gasto.
    await app.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: {
        type: 'income',
        description: 'reembolso',
        amountCents: 10000,
        category: 'mercado',
        occurredOn: '2026-08-15',
      },
    })

    const response = await app.inject({ method: 'GET', url: '/api/budgets?month=2026-08' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      month: '2026-08',
      items: [{ category: 'mercado', budgetCents: 80000, spentCents: 50000 }],
    })
  })

  it('mantém orçamento sem despesa no mês com gasto zero', async () => {
    await setBudget('lazer', 40000)
    const response = await app.inject({ method: 'GET', url: '/api/budgets?month=2026-08' })
    expect(response.json().items).toEqual([
      { category: 'lazer', budgetCents: 40000, spentCents: 0 },
    ])
  })

  it('ordena categorias alfabeticamente respeitando acentos', async () => {
    await setBudget('transporte', 20000)
    await setBudget('água', 10000)
    await setBudget('mercado', 80000)

    const response = await app.inject({ method: 'GET', url: '/api/budgets?month=2026-08' })
    const categories = response.json().items.map((item: { category: string }) => item.category)
    expect(categories).toEqual(['água', 'mercado', 'transporte'])
  })
})

describe('DELETE /api/budgets/:category', () => {
  it('remove orçamento e devolve 204', async () => {
    await setBudget('mercado', 80000)
    const response = await app.inject({ method: 'DELETE', url: '/api/budgets/mercado' })
    expect(response.statusCode).toBe(204)

    const list = await app.inject({ method: 'GET', url: '/api/budgets?month=2026-08' })
    expect(list.json().items).toEqual([])
  })

  it('devolve 404 para categoria sem orçamento', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/api/budgets/inexistente' })
    expect(response.statusCode).toBe(404)
  })

  it('aceita categoria com acento na URL', async () => {
    await setBudget('alimentação', 60000)
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/budgets/${encodeURIComponent('alimentação')}`,
    })
    expect(response.statusCode).toBe(204)
  })
})
