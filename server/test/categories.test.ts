import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

const OWNER = { email: 'lucas@example.com', password: 'senha-forte-123' }
const OTHER = { email: 'maria@example.com', password: 'outra-senha-456' }

let app: FastifyInstance
let auth: string

/** Cria a conta e devolve o header pronto: toda rota de categoria exige token. */
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

async function createCategory(payload: Record<string, unknown>, as = auth) {
  return app.inject({
    method: 'POST',
    url: '/api/categories/catalog',
    headers: { authorization: as },
    payload,
  })
}

describe('POST /api/categories/catalog', () => {
  it('cadastra categoria com cor normalizada e ícone opcional', async () => {
    const response = await createCategory({ name: '  mercado ', color: '#16A34A', icon: '🛒' })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ name: 'mercado', color: '#16a34a', icon: '🛒' })
    expect(response.json().id).toBeTypeOf('number')

    const withoutIcon = await createCategory({ name: 'saúde', color: '#dc2626' })
    expect(withoutIcon.statusCode).toBe(201)
    expect(withoutIcon.json().icon).toBeNull()
  })

  it('rejeita nome vazio, cor fora do formato e ícone longo', async () => {
    const badName = await createCategory({ name: '  ', color: '#000000' })
    expect(badName.statusCode).toBe(400)
    expect(badName.json().error).toBe('validation_error')

    const badColor = await createCategory({ name: 'lazer', color: 'azul' })
    expect(badColor.statusCode).toBe(400)
    expect(badColor.json().issues[0].path).toBe('color')

    const badIcon = await createCategory({ name: 'lazer', color: '#000000', icon: 'x'.repeat(9) })
    expect(badIcon.statusCode).toBe(400)
  })

  it('responde 409 para nome repetido na conta, sem diferenciar maiúsculas', async () => {
    await createCategory({ name: 'mercado', color: '#16a34a' })
    const duplicate = await createCategory({ name: 'Mercado', color: '#000000' })
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json()).toEqual({ error: 'category_exists' })
  })

  it('permite o mesmo nome em contas diferentes', async () => {
    const other = await registerAndAuthorize(OTHER)
    expect((await createCategory({ name: 'mercado', color: '#16a34a' })).statusCode).toBe(201)
    expect((await createCategory({ name: 'mercado', color: '#16a34a' }, other)).statusCode).toBe(
      201,
    )
  })

  it('exige token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/categories/catalog',
      payload: { name: 'mercado', color: '#16a34a' },
    })
    expect(response.statusCode).toBe(401)
  })
})

describe('GET /api/categories/catalog', () => {
  it('lista só as categorias da conta, em ordem alfabética', async () => {
    await createCategory({ name: 'transporte', color: '#2563eb' })
    await createCategory({ name: 'água', color: '#0891b2' })
    await createCategory({ name: 'alimentação', color: '#16a34a' })
    await createCategory(
      { name: 'da outra conta', color: '#000000' },
      await registerAndAuthorize(OTHER),
    )

    const response = await inject({ method: 'GET', url: '/api/categories/catalog' })
    expect(response.statusCode).toBe(200)
    expect(response.json().items.map((item: { name: string }) => item.name)).toEqual([
      'água',
      'alimentação',
      'transporte',
    ])
  })

  it('não muda a lista de categorias usadas em /api/categories', async () => {
    await createCategory({ name: 'cadastrada', color: '#000000' })
    const used = await inject({ method: 'GET', url: '/api/categories' })
    expect(used.json()).toEqual({ categories: [] })
  })
})

describe('PUT /api/categories/catalog/:id', () => {
  async function createTransaction(category: string) {
    return inject({
      method: 'POST',
      url: '/api/transactions',
      payload: {
        type: 'expense',
        description: `compra em ${category}`,
        amountCents: 1000,
        category,
        occurredOn: '2026-09-10',
      },
    })
  }

  it('atualiza cor e ícone', async () => {
    const { id } = (await createCategory({ name: 'mercado', color: '#16a34a' })).json()
    const response = await inject({
      method: 'PUT',
      url: `/api/categories/catalog/${id}`,
      payload: { name: 'mercado', color: '#ea580c', icon: '🥕' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ id, color: '#ea580c', icon: '🥕' })
  })

  it('renomear leva transações e orçamento da conta para o nome novo', async () => {
    const { id } = (await createCategory({ name: 'mercado', color: '#16a34a' })).json()
    await createTransaction('mercado')
    await inject({ method: 'PUT', url: '/api/budgets/mercado', payload: { amountCents: 50000 } })
    // Mesmo nome em outra conta: não pode ser tocado pela renomeação.
    const other = await registerAndAuthorize(OTHER)
    await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { authorization: other },
      payload: {
        type: 'expense',
        description: 'feira',
        amountCents: 500,
        category: 'mercado',
        occurredOn: '2026-09-10',
      },
    })

    const response = await inject({
      method: 'PUT',
      url: `/api/categories/catalog/${id}`,
      payload: { name: 'supermercado', color: '#16a34a' },
    })
    expect(response.statusCode).toBe(200)

    const used = await inject({ method: 'GET', url: '/api/categories' })
    expect(used.json()).toEqual({ categories: ['supermercado'] })
    const budgets = await inject({ method: 'GET', url: '/api/budgets?month=2026-09' })
    expect(budgets.json().items).toMatchObject([
      { category: 'supermercado', budgetCents: 50000, spentCents: 1000 },
    ])
    const otherUsed = await app.inject({
      method: 'GET',
      url: '/api/categories',
      headers: { authorization: other },
    })
    expect(otherUsed.json()).toEqual({ categories: ['mercado'] })
  })

  it('responde 409 ao renomear para um nome já cadastrado, sem mexer nas transações', async () => {
    const { id } = (await createCategory({ name: 'mercado', color: '#16a34a' })).json()
    await createCategory({ name: 'lazer', color: '#9333ea' })
    await createTransaction('mercado')

    const response = await inject({
      method: 'PUT',
      url: `/api/categories/catalog/${id}`,
      payload: { name: 'lazer', color: '#16a34a' },
    })
    expect(response.statusCode).toBe(409)

    const used = await inject({ method: 'GET', url: '/api/categories' })
    expect(used.json()).toEqual({ categories: ['mercado'] })
  })

  it('responde 404 para categoria inexistente ou de outra conta', async () => {
    const { id } = (await createCategory({ name: 'mercado', color: '#16a34a' })).json()
    const other = await registerAndAuthorize(OTHER)

    const missing = await inject({
      method: 'PUT',
      url: '/api/categories/catalog/999',
      payload: { name: 'x', color: '#000000' },
    })
    expect(missing.statusCode).toBe(404)

    const foreign = await app.inject({
      method: 'PUT',
      url: `/api/categories/catalog/${id}`,
      headers: { authorization: other },
      payload: { name: 'roubada', color: '#000000' },
    })
    expect(foreign.statusCode).toBe(404)
  })
})

describe('DELETE /api/categories/catalog/:id', () => {
  it('remove do catálogo e mantém o nome nas transações', async () => {
    const { id } = (await createCategory({ name: 'mercado', color: '#16a34a' })).json()
    await inject({
      method: 'POST',
      url: '/api/transactions',
      payload: {
        type: 'expense',
        description: 'feira',
        amountCents: 1000,
        category: 'mercado',
        occurredOn: '2026-09-10',
      },
    })

    const response = await inject({ method: 'DELETE', url: `/api/categories/catalog/${id}` })
    expect(response.statusCode).toBe(204)

    const catalog = await inject({ method: 'GET', url: '/api/categories/catalog' })
    expect(catalog.json()).toEqual({ items: [] })
    const used = await inject({ method: 'GET', url: '/api/categories' })
    expect(used.json()).toEqual({ categories: ['mercado'] })
  })

  it('responde 404 para categoria de outra conta', async () => {
    const { id } = (await createCategory({ name: 'mercado', color: '#16a34a' })).json()
    const other = await registerAndAuthorize(OTHER)
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/categories/catalog/${id}`,
      headers: { authorization: other },
    })
    expect(response.statusCode).toBe(404)
  })
})
