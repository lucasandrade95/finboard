import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

const OWNER = { email: 'lucas@example.com', password: 'senha-forte-123' }
const OTHER = { email: 'maria@example.com', password: 'outra-senha-456' }

let app: FastifyInstance
let auth: string

/** Cria a conta e devolve o header pronto: toda rota de orçamento exige token. */
async function registerAndAuthorize(credentials = OWNER): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: credentials,
  })
  return `Bearer ${response.json().token}`
}

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' })
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

async function setBudget(category: string, amountCents: number, as = auth) {
  return app.inject({
    method: 'PUT',
    url: `/api/budgets/${encodeURIComponent(category)}`,
    headers: { authorization: as },
    payload: { amountCents },
  })
}

async function addExpense(category: string, amountCents: number, occurredOn: string, as = auth) {
  return app.inject({
    method: 'POST',
    url: '/api/transactions',
    headers: { authorization: as },
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

    const response = await inject({ method: 'GET', url: '/api/budgets?month=2026-08' })
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
    const response = await inject({ method: 'GET', url: '/api/budgets' })
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
    await inject({
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

    const response = await inject({ method: 'GET', url: '/api/budgets?month=2026-08' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      month: '2026-08',
      items: [{ category: 'mercado', budgetCents: 80000, spentCents: 50000 }],
    })
  })

  it('mantém orçamento sem despesa no mês com gasto zero', async () => {
    await setBudget('lazer', 40000)
    const response = await inject({ method: 'GET', url: '/api/budgets?month=2026-08' })
    expect(response.json().items).toEqual([
      { category: 'lazer', budgetCents: 40000, spentCents: 0 },
    ])
  })

  it('ordena categorias alfabeticamente respeitando acentos', async () => {
    await setBudget('transporte', 20000)
    await setBudget('água', 10000)
    await setBudget('mercado', 80000)

    const response = await inject({ method: 'GET', url: '/api/budgets?month=2026-08' })
    const categories = response.json().items.map((item: { category: string }) => item.category)
    expect(categories).toEqual(['água', 'mercado', 'transporte'])
  })
})

describe('DELETE /api/budgets/:category', () => {
  it('remove orçamento e devolve 204', async () => {
    await setBudget('mercado', 80000)
    const response = await inject({ method: 'DELETE', url: '/api/budgets/mercado' })
    expect(response.statusCode).toBe(204)

    const list = await inject({ method: 'GET', url: '/api/budgets?month=2026-08' })
    expect(list.json().items).toEqual([])
  })

  it('devolve 404 para categoria sem orçamento', async () => {
    const response = await inject({ method: 'DELETE', url: '/api/budgets/inexistente' })
    expect(response.statusCode).toBe(404)
  })

  it('aceita categoria com acento na URL', async () => {
    await setBudget('alimentação', 60000)
    const response = await inject({
      method: 'DELETE',
      url: `/api/budgets/${encodeURIComponent('alimentação')}`,
    })
    expect(response.statusCode).toBe(204)
  })
})

describe('escopo por usuário', () => {
  let otherAuth: string

  beforeEach(async () => {
    otherAuth = await registerAndAuthorize(OTHER)
  })

  function injectAsOther(options: InjectOptions) {
    return app.inject({ ...options, headers: { authorization: otherAuth, ...options.headers } })
  }

  it('responde 401 sem token em todas as rotas', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/budgets?month=2026-08' })
    const upsert = await app.inject({
      method: 'PUT',
      url: '/api/budgets/mercado',
      payload: { amountCents: 1000 },
    })
    const remove = await app.inject({ method: 'DELETE', url: '/api/budgets/mercado' })

    expect([list.statusCode, upsert.statusCode, remove.statusCode]).toEqual([401, 401, 401])
  })

  it('cada conta tem o próprio teto para a mesma categoria', async () => {
    await setBudget('mercado', 80000)
    await setBudget('mercado', 15000, otherAuth)

    const owner = await inject({ method: 'GET', url: '/api/budgets?month=2026-08' })
    const other = await injectAsOther({ method: 'GET', url: '/api/budgets?month=2026-08' })

    expect(owner.json().items).toEqual([{ category: 'mercado', budgetCents: 80000, spentCents: 0 }])
    expect(other.json().items).toEqual([{ category: 'mercado', budgetCents: 15000, spentCents: 0 }])
  })

  it('gasto da outra conta não entra no progresso', async () => {
    await setBudget('mercado', 80000)
    await addExpense('mercado', 10000, '2026-08-05')
    await addExpense('mercado', 70000, '2026-08-06', otherAuth)

    const response = await inject({ method: 'GET', url: '/api/budgets?month=2026-08' })
    expect(response.json().items[0].spentCents).toBe(10000)
  })

  it('não permite excluir orçamento de outra conta', async () => {
    await setBudget('mercado', 80000)

    // 404 e não 403: a categoria orçada pela outra conta não existe para quem pergunta.
    const remove = await injectAsOther({ method: 'DELETE', url: '/api/budgets/mercado' })
    expect(remove.statusCode).toBe(404)

    const still = await inject({ method: 'GET', url: '/api/budgets?month=2026-08' })
    expect(still.json().items[0]).toMatchObject({ category: 'mercado', budgetCents: 80000 })
  })
})
