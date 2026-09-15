import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

const OWNER = { email: 'lucas@example.com', password: 'senha-forte-123' }
const OTHER = { email: 'maria@example.com', password: 'outra-senha-456' }

let app: FastifyInstance
let ownerAuth: string

/** Cria a conta e devolve o header pronto: toda rota de transação exige token. */
async function registerAndAuthorize(
  instance: FastifyInstance,
  credentials = OWNER,
): Promise<string> {
  const response = await instance.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: credentials,
  })
  return `Bearer ${response.json().token}`
}

/** `app.inject` já autenticado como o dono padrão dos testes. */
async function inject(options: InjectOptions) {
  return app.inject({
    ...options,
    headers: { authorization: ownerAuth, ...options.headers },
  })
}

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' })
  await app.ready()
  ownerAuth = await registerAndAuthorize(app)
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
    const response = await inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })
})

describe('POST /api/transactions', () => {
  it('cria transação e devolve o registro com id', async () => {
    const response = await inject({
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
    const response = await inject({ method: 'POST', url: '/api/transactions', payload })
    expect(response.statusCode).toBe(201)
    expect(response.json().category).toBe('geral')
  })

  it('rejeita payload inválido com 400 e detalhes', async () => {
    const response = await inject({
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
      await inject({
        method: 'POST',
        url: '/api/transactions',
        payload: validPayload({ description, occurredOn }),
      })
    }

    const response = await inject({ method: 'GET', url: '/api/transactions?month=2026-08' })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.total).toBe(2)
    expect(body.limit).toBe(20)
    expect(body.offset).toBe(0)
    expect(body.items.map((t: { description: string }) => t.description)).toEqual([
      'agosto tarde',
      'agosto cedo',
    ])
  })

  it('rejeita mês mal formatado', async () => {
    const response = await inject({ method: 'GET', url: '/api/transactions?month=agosto' })
    expect(response.statusCode).toBe(400)
  })

  it('pagina com limit/offset mantendo o total do filtro', async () => {
    for (let day = 1; day <= 5; day += 1) {
      await inject({
        method: 'POST',
        url: '/api/transactions',
        payload: validPayload({
          description: `compra ${day}`,
          occurredOn: `2026-08-0${day}`,
        }),
      })
    }

    const response = await inject({
      method: 'GET',
      url: '/api/transactions?month=2026-08&limit=2&offset=2',
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toMatchObject({ total: 5, limit: 2, offset: 2 })
    expect(body.items.map((t: { description: string }) => t.description)).toEqual([
      'compra 3',
      'compra 2',
    ])
  })

  it('devolve página vazia quando offset passa do total, sem perder o total', async () => {
    await inject({ method: 'POST', url: '/api/transactions', payload: validPayload() })

    const response = await inject({
      method: 'GET',
      url: '/api/transactions?month=2026-08&limit=10&offset=50',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ items: [], total: 1 })
  })

  it('rejeita limit fora do intervalo 1..100', async () => {
    for (const limit of ['0', '101', 'abc']) {
      const response = await inject({
        method: 'GET',
        url: `/api/transactions?limit=${limit}`,
      })
      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('validation_error')
    }
  })

  it('rejeita offset negativo', async () => {
    const response = await inject({ method: 'GET', url: '/api/transactions?offset=-1' })
    expect(response.statusCode).toBe(400)
  })

  it('filtra por categoria combinado com mês, com total do filtro', async () => {
    const entries = [
      { description: 'feira', category: 'alimentação', occurredOn: '2026-08-02' },
      { description: 'restaurante', category: 'alimentação', occurredOn: '2026-08-10' },
      { description: 'ônibus', category: 'transporte', occurredOn: '2026-08-05' },
      { description: 'feira de julho', category: 'alimentação', occurredOn: '2026-07-15' },
    ]
    for (const entry of entries) {
      await inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await inject({
      method: 'GET',
      url: `/api/transactions?month=2026-08&category=${encodeURIComponent('alimentação')}`,
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.total).toBe(2)
    expect(body.items.map((t: { description: string }) => t.description)).toEqual([
      'restaurante',
      'feira',
    ])
  })

  it('devolve lista vazia quando a categoria não tem transações', async () => {
    await inject({ method: 'POST', url: '/api/transactions', payload: validPayload() })

    const response = await inject({ method: 'GET', url: '/api/transactions?category=viagem' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ items: [], total: 0 })
  })

  it('rejeita categoria vazia', async () => {
    const response = await inject({ method: 'GET', url: '/api/transactions?category=' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('validation_error')
  })

  it('filtra por tipo combinado com mês, com total do filtro', async () => {
    const entries = [
      { type: 'income', description: 'salário', occurredOn: '2026-08-05' },
      { type: 'income', description: 'freela', occurredOn: '2026-08-12' },
      { type: 'expense', description: 'mercado', occurredOn: '2026-08-08' },
      { type: 'income', description: 'salário de julho', occurredOn: '2026-07-05' },
    ]
    for (const entry of entries) {
      await inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await inject({
      method: 'GET',
      url: '/api/transactions?month=2026-08&type=income',
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.total).toBe(2)
    expect(body.items.map((t: { description: string }) => t.description)).toEqual([
      'freela',
      'salário',
    ])
  })

  it('combina filtro de tipo com categoria', async () => {
    const entries = [
      { type: 'expense', description: 'feira', category: 'alimentação' },
      { type: 'income', description: 'venda de bolo', category: 'alimentação' },
      { type: 'expense', description: 'ônibus', category: 'transporte' },
    ]
    for (const entry of entries) {
      await inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await inject({
      method: 'GET',
      url: `/api/transactions?type=expense&category=${encodeURIComponent('alimentação')}`,
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.total).toBe(1)
    expect(body.items[0].description).toBe('feira')
  })

  it('rejeita tipo desconhecido', async () => {
    const response = await inject({ method: 'GET', url: '/api/transactions?type=investimento' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('validation_error')
  })

  it('busca por trecho da descrição, ignorando maiúsculas/minúsculas', async () => {
    const entries = [
      { description: 'Mercado do bairro', occurredOn: '2026-08-02' },
      { description: 'supermercado', occurredOn: '2026-08-10' },
      { description: 'ônibus', occurredOn: '2026-08-05' },
    ]
    for (const entry of entries) {
      await inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await inject({ method: 'GET', url: '/api/transactions?q=MERCADO' })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.total).toBe(2)
    expect(body.items.map((t: { description: string }) => t.description)).toEqual([
      'supermercado',
      'Mercado do bairro',
    ])
  })

  it('combina busca com mês, tipo e categoria', async () => {
    const entries = [
      {
        type: 'expense',
        description: 'feira da rua',
        category: 'alimentação',
        occurredOn: '2026-08-02',
      },
      {
        type: 'income',
        description: 'feira de artesanato',
        category: 'alimentação',
        occurredOn: '2026-08-03',
      },
      {
        type: 'expense',
        description: 'feira de julho',
        category: 'alimentação',
        occurredOn: '2026-07-04',
      },
      { type: 'expense', description: 'ônibus', category: 'transporte', occurredOn: '2026-08-05' },
    ]
    for (const entry of entries) {
      await inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await inject({
      method: 'GET',
      url: `/api/transactions?month=2026-08&type=expense&category=${encodeURIComponent('alimentação')}&q=feira`,
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.total).toBe(1)
    expect(body.items[0].description).toBe('feira da rua')
  })

  it('trata curingas do LIKE como texto literal', async () => {
    const entries = [
      { description: 'desconto 50%' },
      { description: 'desconto 50 reais' },
      { description: 'plano a_b' },
      { description: 'plano axb' },
    ]
    for (const entry of entries) {
      await inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const percent = await inject({ method: 'GET', url: '/api/transactions?q=50%25' })
    expect(percent.statusCode).toBe(200)
    expect(percent.json().items.map((t: { description: string }) => t.description)).toEqual([
      'desconto 50%',
    ])

    const underscore = await inject({ method: 'GET', url: '/api/transactions?q=a_b' })
    expect(underscore.statusCode).toBe(200)
    expect(underscore.json().items.map((t: { description: string }) => t.description)).toEqual([
      'plano a_b',
    ])
  })

  it('devolve lista vazia quando a busca não casa com nada', async () => {
    await inject({ method: 'POST', url: '/api/transactions', payload: validPayload() })

    const response = await inject({ method: 'GET', url: '/api/transactions?q=viagem' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ items: [], total: 0 })
  })

  it('rejeita busca vazia', async () => {
    const response = await inject({ method: 'GET', url: '/api/transactions?q=' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('validation_error')
  })
})

describe('PUT /api/transactions/:id', () => {
  it('atualiza todos os campos e devolve o registro atualizado', async () => {
    const created = await inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload(),
    })
    const { id, createdAt } = created.json()

    const response = await inject({
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
      recurring: false,
      createdAt,
    })

    const summary = await inject({ method: 'GET', url: '/api/summary?month=2026-08' })
    expect(summary.json()).toEqual({
      incomeCents: 500000,
      expenseCents: 0,
      balanceCents: 500000,
      previous: { month: '2026-07', incomeCents: 0, expenseCents: 0, balanceCents: 0 },
    })
  })

  it('devolve 404 quando o id não existe', async () => {
    const response = await inject({
      method: 'PUT',
      url: '/api/transactions/999',
      payload: validPayload(),
    })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'not_found' })
  })

  it('rejeita payload inválido com 400 sem alterar o registro', async () => {
    const created = await inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload(),
    })
    const { id } = created.json()

    const response = await inject({
      method: 'PUT',
      url: `/api/transactions/${id}`,
      payload: validPayload({ amountCents: 0 }),
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('validation_error')

    const list = await inject({ method: 'GET', url: '/api/transactions?month=2026-08' })
    expect(list.json().items[0].amountCents).toBe(15990)
  })
})

describe('DELETE /api/transactions/:id', () => {
  it('exclui transação existente e devolve 204', async () => {
    const created = await inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload(),
    })
    const { id } = created.json()

    const response = await inject({ method: 'DELETE', url: `/api/transactions/${id}` })
    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')

    const list = await inject({ method: 'GET', url: '/api/transactions' })
    expect(list.json()).toMatchObject({ items: [], total: 0 })
  })

  it('devolve 404 quando o id não existe', async () => {
    const response = await inject({ method: 'DELETE', url: '/api/transactions/999' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'not_found' })
  })

  it('rejeita id não numérico com 400', async () => {
    const response = await inject({ method: 'DELETE', url: '/api/transactions/abc' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('validation_error')
  })
})

describe('GET /api/categories', () => {
  it('devolve categorias distintas em ordem alfabética pt-BR', async () => {
    const entries = [
      { category: 'transporte' },
      { category: 'alimentação' },
      { category: 'alimentação' },
      { category: 'água' },
    ]
    for (const entry of entries) {
      await inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await inject({ method: 'GET', url: '/api/categories' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ categories: ['água', 'alimentação', 'transporte'] })
  })

  it('restringe as categorias ao mês informado', async () => {
    const entries = [
      { category: 'alimentação', occurredOn: '2026-08-02' },
      { category: 'transporte', occurredOn: '2026-07-15' },
    ]
    for (const entry of entries) {
      await inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await inject({ method: 'GET', url: '/api/categories?month=2026-08' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ categories: ['alimentação'] })
  })

  it('devolve lista vazia quando não há transações', async () => {
    const response = await inject({ method: 'GET', url: '/api/categories' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ categories: [] })
  })

  it('rejeita mês mal formatado', async () => {
    const response = await inject({ method: 'GET', url: '/api/categories?month=agosto' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('validation_error')
  })
})

describe('GET /api/expenses-by-category', () => {
  it('soma só despesas, agrupa por categoria e ordena do maior para o menor', async () => {
    const entries = [
      { type: 'expense', category: 'alimentação', amountCents: 10000 },
      { type: 'expense', category: 'alimentação', amountCents: 5000 },
      { type: 'expense', category: 'transporte', amountCents: 20000 },
      { type: 'income', category: 'trabalho', amountCents: 900000 },
    ]
    for (const entry of entries) {
      await inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await inject({ method: 'GET', url: '/api/expenses-by-category' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      items: [
        { category: 'transporte', totalCents: 20000 },
        { category: 'alimentação', totalCents: 15000 },
      ],
      totalCents: 35000,
    })
  })

  it('desempata categorias de mesmo total por nome em pt-BR', async () => {
    const entries = [
      { type: 'expense', category: 'transporte', amountCents: 5000 },
      { type: 'expense', category: 'água', amountCents: 5000 },
      { type: 'expense', category: 'alimentação', amountCents: 5000 },
    ]
    for (const entry of entries) {
      await inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await inject({ method: 'GET', url: '/api/expenses-by-category' })
    expect(response.json().items.map((item: { category: string }) => item.category)).toEqual([
      'água',
      'alimentação',
      'transporte',
    ])
  })

  it('restringe ao mês informado', async () => {
    const entries = [
      { type: 'expense', category: 'alimentação', amountCents: 10000, occurredOn: '2026-08-02' },
      { type: 'expense', category: 'transporte', amountCents: 90000, occurredOn: '2026-07-15' },
    ]
    for (const entry of entries) {
      await inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await inject({
      method: 'GET',
      url: '/api/expenses-by-category?month=2026-08',
    })
    expect(response.json()).toEqual({
      items: [{ category: 'alimentação', totalCents: 10000 }],
      totalCents: 10000,
    })
  })

  it('devolve total zero quando só há receitas', async () => {
    await inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ type: 'income' }),
    })

    const response = await inject({ method: 'GET', url: '/api/expenses-by-category' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ items: [], totalCents: 0 })
  })

  it('rejeita mês mal formatado', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/expenses-by-category?month=agosto',
    })
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
      await inject({
        method: 'POST',
        url: '/api/transactions',
        payload: validPayload(entry),
      })
    }

    const response = await inject({ method: 'GET', url: '/api/summary?month=2026-08' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      incomeCents: 500000,
      expenseCents: 150000,
      balanceCents: 350000,
      previous: { month: '2026-07', incomeCents: 999900, expenseCents: 0, balanceCents: 999900 },
    })
  })

  it('compara janeiro com dezembro do ano anterior', async () => {
    const entries = [
      { type: 'income', amountCents: 100000, occurredOn: '2026-01-10' },
      { type: 'expense', amountCents: 40000, occurredOn: '2025-12-20' },
    ]
    for (const entry of entries) {
      await inject({
        method: 'POST',
        url: '/api/transactions',
        payload: validPayload(entry),
      })
    }

    const response = await inject({ method: 'GET', url: '/api/summary?month=2026-01' })
    expect(response.json()).toEqual({
      incomeCents: 100000,
      expenseCents: 0,
      balanceCents: 100000,
      previous: { month: '2025-12', incomeCents: 0, expenseCents: 40000, balanceCents: -40000 },
    })
  })

  it('sem mês devolve o resumo geral sem comparativo', async () => {
    await inject({ method: 'POST', url: '/api/transactions', payload: validPayload() })

    const response = await inject({ method: 'GET', url: '/api/summary' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      incomeCents: 0,
      expenseCents: 15990,
      balanceCents: -15990,
    })
  })
})

describe('GET /api/daily-balance', () => {
  it('devolve um ponto por dia do mês com saldo acumulado', async () => {
    const entries = [
      { type: 'income', amountCents: 500000, occurredOn: '2026-08-01' },
      { type: 'expense', amountCents: 120000, occurredOn: '2026-08-03' },
      { type: 'expense', amountCents: 30000, occurredOn: '2026-08-03' },
      { type: 'income', amountCents: 999900, occurredOn: '2026-07-31' },
    ]
    for (const entry of entries) {
      await inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await inject({ method: 'GET', url: '/api/daily-balance?month=2026-08' })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.month).toBe('2026-08')
    expect(body.items).toHaveLength(31)
    expect(body.items[0]).toEqual({
      date: '2026-08-01',
      incomeCents: 500000,
      expenseCents: 0,
      netCents: 500000,
      balanceCents: 500000,
    })
    // Dia sem movimento carrega o saldo do dia anterior.
    expect(body.items[1]).toEqual({
      date: '2026-08-02',
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
      balanceCents: 500000,
    })
    // Duas despesas no mesmo dia somam.
    expect(body.items[2]).toEqual({
      date: '2026-08-03',
      incomeCents: 0,
      expenseCents: 150000,
      netCents: -150000,
      balanceCents: 350000,
    })
    // O mês anterior não entra no acumulado.
    expect(body.items[30].balanceCents).toBe(350000)
  })

  it('respeita o número de dias do mês (fevereiro bissexto)', async () => {
    const response = await inject({ method: 'GET', url: '/api/daily-balance?month=2024-02' })
    expect(response.statusCode).toBe(200)
    const { items } = response.json()
    expect(items).toHaveLength(29)
    expect(items[28].date).toBe('2024-02-29')
    expect(items.every((item: { balanceCents: number }) => item.balanceCents === 0)).toBe(true)
  })

  it('exige o mês e rejeita formato inválido', async () => {
    const semMes = await inject({ method: 'GET', url: '/api/daily-balance' })
    expect(semMes.statusCode).toBe(400)
    expect(semMes.json().error).toBe('validation_error')

    const invalido = await inject({ method: 'GET', url: '/api/daily-balance?month=2026-8' })
    expect(invalido.statusCode).toBe(400)
  })
})

describe('transações recorrentes', () => {
  // Geração acontece no boot: precisa de banco em arquivo para sobreviver ao close/reopen.
  let dir: string
  let dbPath: string
  let fileAuth: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finboard-test-'))
    dbPath = join(dir, 'test.db')
    fileAuth = ''
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  // O dono é criado no primeiro boot. Como o segredo dos JWTs é o mesmo em todas as
  // instâncias, o token emitido ali continua valendo nos boots seguintes do arquivo.
  async function bootApp(recurringMonth: string): Promise<FastifyInstance> {
    const instance = await buildApp({ dbPath, recurringMonth })
    await instance.ready()
    if (!fileAuth) {
      fileAuth = await registerAndAuthorize(instance)
    }
    return instance
  }

  async function injectAs(instance: FastifyInstance, options: InjectOptions) {
    return instance.inject({ ...options, headers: { authorization: fileAuth } })
  }

  it('cria transação com a flag e devolve recurring no registro', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ recurring: true }),
    })
    expect(response.statusCode).toBe(201)
    expect(response.json().recurring).toBe(true)

    const semFlag = await inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload(),
    })
    expect(semFlag.json().recurring).toBe(false)
  })

  it('gera cópia no boot para o mês seguinte, só das recorrentes', async () => {
    const first = await bootApp('2026-08')
    await injectAs(first, {
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ description: 'Aluguel', occurredOn: '2026-08-05', recurring: true }),
    })
    await injectAs(first, {
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ description: 'Mercado', occurredOn: '2026-08-10' }),
    })
    await first.close()

    const second = await bootApp('2026-09')
    const response = await injectAs(second, {
      method: 'GET',
      url: '/api/transactions?month=2026-09',
    })
    await second.close()

    const body = response.json()
    expect(body.total).toBe(1)
    expect(body.items[0]).toMatchObject({
      description: 'Aluguel',
      amountCents: 15990,
      occurredOn: '2026-09-05',
      recurring: true,
    })
  })

  it('não duplica quando o boot roda de novo no mesmo mês', async () => {
    const first = await bootApp('2026-08')
    await injectAs(first, {
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ description: 'Aluguel', occurredOn: '2026-08-05', recurring: true }),
    })
    await first.close()

    for (let boot = 0; boot < 2; boot += 1) {
      const instance = await bootApp('2026-09')
      await instance.close()
    }

    const check = await bootApp('2026-09')
    const response = await injectAs(check, {
      method: 'GET',
      url: '/api/transactions?month=2026-09',
    })
    await check.close()
    expect(response.json().total).toBe(1)
  })

  it('usa a ocorrência mais recente da série como modelo (edição vale dali em diante)', async () => {
    const first = await bootApp('2026-08')
    for (const [amountCents, occurredOn] of [
      [100000, '2026-07-05'],
      [120000, '2026-08-05'],
    ] as const) {
      await injectAs(first, {
        method: 'POST',
        url: '/api/transactions',
        payload: validPayload({ description: 'Aluguel', amountCents, occurredOn, recurring: true }),
      })
    }
    await first.close()

    const second = await bootApp('2026-09')
    const response = await injectAs(second, {
      method: 'GET',
      url: '/api/transactions?month=2026-09',
    })
    await second.close()

    const body = response.json()
    expect(body.total).toBe(1)
    expect(body.items[0]).toMatchObject({ amountCents: 120000, occurredOn: '2026-09-05' })
  })

  it('clampa o dia ao tamanho do mês (dia 31 vira 28 em fevereiro)', async () => {
    const first = await bootApp('2026-01')
    await injectAs(first, {
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ description: 'Fatura', occurredOn: '2026-01-31', recurring: true }),
    })
    await first.close()

    const second = await bootApp('2026-02')
    const response = await injectAs(second, {
      method: 'GET',
      url: '/api/transactions?month=2026-02',
    })
    await second.close()

    expect(response.json().items[0].occurredOn).toBe('2026-02-28')
  })

  it('gera mesmo com mês sem boot no meio (última ocorrência pode ser antiga)', async () => {
    const first = await bootApp('2026-07')
    await injectAs(first, {
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({
        description: 'Assinatura',
        occurredOn: '2026-07-12',
        recurring: true,
      }),
    })
    await first.close()

    // Pula agosto: o boot de setembro ainda encontra a série pela ocorrência de julho.
    const second = await bootApp('2026-09')
    const response = await injectAs(second, {
      method: 'GET',
      url: '/api/transactions?month=2026-09',
    })
    await second.close()

    const body = response.json()
    expect(body.total).toBe(1)
    expect(body.items[0]).toMatchObject({ description: 'Assinatura', occurredOn: '2026-09-12' })
  })
})

describe('GET /api/transactions/export.csv', () => {
  it('exporta o mês em CSV ordenado por data, com cabeçalho e valores em vírgula decimal', async () => {
    await inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ description: 'Mercado', occurredOn: '2026-08-20' }),
    })
    await inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({
        type: 'income',
        description: 'Salário',
        amountCents: 500000,
        category: 'renda',
        occurredOn: '2026-08-05',
        recurring: true,
      }),
    })
    // Fora do mês pedido: não pode aparecer no arquivo.
    await inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ occurredOn: '2026-07-31' }),
    })

    const response = await inject({
      method: 'GET',
      url: '/api/transactions/export.csv?month=2026-08',
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="transacoes-2026-08.csv"',
    )
    expect(response.body).toBe(
      '\ufeff' +
        'data;tipo;descricao;categoria;valor;recorrente\r\n' +
        '2026-08-05;receita;Salário;renda;5000,00;sim\r\n' +
        '2026-08-20;despesa;Mercado;alimentação;159,90;não\r\n',
    )
  })

  it('escapa campo com separador, aspas e quebra de linha', async () => {
    await inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ description: 'Feira; "orgânicos"\nsemanal', amountCents: 4205 }),
    })

    const response = await inject({
      method: 'GET',
      url: '/api/transactions/export.csv?month=2026-08',
    })
    const lines = response.body.split('\r\n')
    expect(lines[1]).toBe(
      '2026-08-20;despesa;"Feira; ""orgânicos""\nsemanal";alimentação;42,05;não',
    )
  })

  it('mês sem transações devolve só o cabeçalho', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/transactions/export.csv?month=2026-01',
    })
    expect(response.statusCode).toBe(200)
    expect(response.body).toBe('\ufeffdata;tipo;descricao;categoria;valor;recorrente\r\n')
  })

  it('exige month e rejeita formato inválido com 400', async () => {
    const missing = await inject({ method: 'GET', url: '/api/transactions/export.csv' })
    expect(missing.statusCode).toBe(400)

    const invalid = await inject({
      method: 'GET',
      url: '/api/transactions/export.csv?month=08-2026',
    })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().error).toBe('validation_error')
  })
})

describe('POST /api/transactions/import', () => {
  const HEADER = 'data;tipo;descricao;categoria;valor;recorrente'

  function importCsv(body: string, contentType = 'text/csv') {
    return inject({
      method: 'POST',
      url: '/api/transactions/import',
      headers: { 'content-type': contentType },
      payload: body,
    })
  }

  it('importa as linhas válidas e elas aparecem na listagem e no resumo', async () => {
    const response = await importCsv(
      `${HEADER}\r\n` +
        '2026-08-05;receita;Salário;renda;5.000,00;sim\r\n' +
        '2026-08-20;despesa;Mercado;alimentação;159,9;não\r\n' +
        '2026-08-21;despesa;Padaria;;12;\r\n',
    )
    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ imported: 3 })

    const list = await inject({ method: 'GET', url: '/api/transactions?month=2026-08' })
    const items = list.json().items as Array<Record<string, unknown>>
    expect(items.map((item) => [item.description, item.amountCents, item.category])).toEqual([
      ['Padaria', 1200, 'geral'],
      ['Mercado', 15990, 'alimentação'],
      ['Salário', 500000, 'renda'],
    ])
    expect(items.find((item) => item.description === 'Salário')?.recurring).toBe(true)

    const summary = await inject({ method: 'GET', url: '/api/summary?month=2026-08' })
    expect(summary.json()).toMatchObject({ incomeCents: 500000, expenseCents: 17190 })
  })

  it('aceita de volta o próprio export (BOM, aspas e quebra de linha)', async () => {
    await inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ description: 'Feira; "orgânicos"\nsemanal', amountCents: 4205 }),
    })
    const exported = await inject({
      method: 'GET',
      url: '/api/transactions/export.csv?month=2026-08',
    })
    await inject({ method: 'DELETE', url: '/api/transactions/1' })

    const response = await importCsv(exported.body)
    expect(response.statusCode).toBe(201)

    const list = await inject({ method: 'GET', url: '/api/transactions?month=2026-08' })
    expect(list.json().items[0]).toMatchObject({
      description: 'Feira; "orgânicos"\nsemanal',
      amountCents: 4205,
      category: 'alimentação',
      recurring: false,
    })
  })

  it('relata todos os erros com linha e coluna e não importa nada', async () => {
    const response = await importCsv(
      `${HEADER}\n` +
        '2026-08-05;receita;Salário;renda;5000,00;sim\n' +
        '2026-08-20;transferência;Mercado;alimentação;12,345;talvez\n' +
        '20/08/2026;despesa;;alimentação;0,00;não\n' +
        '2026-08-21;despesa;Padaria\n',
    )
    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error).toBe('invalid_csv')
    expect(body.errorCount).toBe(7)
    expect(
      body.errors.map((error: { line: number; column?: string }) => [error.line, error.column]),
    ).toEqual([
      [3, 'tipo'],
      [3, 'valor'],
      [3, 'recorrente'],
      [4, 'descricao'],
      [4, 'valor'],
      [4, 'data'],
      [5, undefined],
    ])
    expect(body.errors[6].message).toBe('esperadas 6 colunas, encontradas 3')

    // A linha 2 era válida, mas o arquivo com erro é rejeitado inteiro.
    const list = await inject({ method: 'GET', url: '/api/transactions' })
    expect(list.json().total).toBe(0)
  })

  it('conta linhas físicas quando um campo entre aspas tem quebra de linha', async () => {
    const response = await importCsv(
      `${HEADER}\n` +
        '2026-08-05;despesa;"linha 1\nlinha 2";casa;10,00;não\n' +
        '2026-08-06;x;a;b;1;não\n',
    )
    expect(response.statusCode).toBe(400)
    expect(response.json().errors).toEqual([
      { line: 4, column: 'tipo', message: 'use "receita" ou "despesa"' },
    ])
  })

  it('rejeita cabeçalho diferente, arquivo sem linhas e aspas não fechadas', async () => {
    const wrongHeader = await importCsv('date,type,amount\n2026-08-05,expense,10\n')
    expect(wrongHeader.statusCode).toBe(400)
    expect(wrongHeader.json().errors[0]).toEqual({
      line: 1,
      message: `cabeçalho esperado: ${HEADER}`,
    })

    const onlyHeader = await importCsv(`${HEADER}\r\n`)
    expect(onlyHeader.statusCode).toBe(400)
    expect(onlyHeader.json().errors[0].message).toBe('arquivo sem transações')

    const openQuote = await importCsv(`${HEADER}\n2026-08-05;despesa;"sem fim;casa;1;não\n`)
    expect(openQuote.statusCode).toBe(400)
    expect(openQuote.json().errors[0].message).toBe('aspas abertas na linha 2 não foram fechadas')
  })

  it('limita o relatório a 50 erros mas informa o total', async () => {
    const lines = Array.from({ length: 60 }, () => '2026-08-05;x;a;b;1;não')
    const response = await importCsv([HEADER, ...lines].join('\n'))
    expect(response.statusCode).toBe(400)
    expect(response.json().errorCount).toBe(60)
    expect(response.json().errors).toHaveLength(50)
  })

  it('exige corpo text/csv', async () => {
    const json = await inject({
      method: 'POST',
      url: '/api/transactions/import',
      payload: { csv: HEADER },
    })
    expect(json.statusCode).toBe(400)
    expect(json.json().error).toBe('validation_error')

    const unsupported = await importCsv(HEADER, 'application/xml')
    expect(unsupported.statusCode).toBe(415)
  })
})

describe('escopo por usuário', () => {
  let otherAuth: string

  beforeEach(async () => {
    otherAuth = await registerAndAuthorize(app, OTHER)
  })

  function injectAsOther(options: InjectOptions) {
    return app.inject({ ...options, headers: { authorization: otherAuth, ...options.headers } })
  }

  async function createForOwner(overrides: Record<string, unknown> = {}) {
    const response = await inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload(overrides),
    })
    return response.json().id as number
  }

  it('cada conta só enxerga as próprias transações na listagem', async () => {
    await createForOwner({ description: 'Mercado do Lucas' })
    await injectAsOther({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ description: 'Mercado da Maria' }),
    })

    const owner = await inject({ method: 'GET', url: '/api/transactions?month=2026-08' })
    const other = await injectAsOther({ method: 'GET', url: '/api/transactions?month=2026-08' })

    expect(owner.json().total).toBe(1)
    expect(owner.json().items[0].description).toBe('Mercado do Lucas')
    expect(other.json().total).toBe(1)
    expect(other.json().items[0].description).toBe('Mercado da Maria')
  })

  it('não permite editar nem excluir transação de outra conta', async () => {
    const id = await createForOwner()

    const update = await injectAsOther({
      method: 'PUT',
      url: `/api/transactions/${id}`,
      payload: validPayload({ description: 'sequestrada' }),
    })
    const remove = await injectAsOther({ method: 'DELETE', url: `/api/transactions/${id}` })

    // 404 e não 403: o id de outra conta não existe do ponto de vista de quem pergunta.
    expect(update.statusCode).toBe(404)
    expect(remove.statusCode).toBe(404)

    const still = await inject({ method: 'GET', url: `/api/transactions?month=2026-08` })
    expect(still.json().items[0]).toMatchObject({ id, description: 'Mercado' })
  })

  it('resumo, categorias, despesas por categoria e saldo diário ignoram a outra conta', async () => {
    await createForOwner({ type: 'expense', amountCents: 10000, category: 'alimentação' })
    await injectAsOther({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ type: 'expense', amountCents: 999900, category: 'viagem' }),
    })

    const summary = await inject({ method: 'GET', url: '/api/summary?month=2026-08' })
    expect(summary.json().expenseCents).toBe(10000)

    const categories = await inject({ method: 'GET', url: '/api/categories?month=2026-08' })
    expect(categories.json().categories).toEqual(['alimentação'])

    const byCategory = await inject({
      method: 'GET',
      url: '/api/expenses-by-category?month=2026-08',
    })
    expect(byCategory.json().totalCents).toBe(10000)

    const daily = await inject({ method: 'GET', url: '/api/daily-balance?month=2026-08' })
    expect(daily.json().items.at(-1).balanceCents).toBe(-10000)
  })

  it('export e import ficam restritos à conta autenticada', async () => {
    await createForOwner({ description: 'Só do Lucas' })

    const exported = await injectAsOther({
      method: 'GET',
      url: '/api/transactions/export.csv?month=2026-08',
    })
    expect(exported.body).not.toContain('Só do Lucas')

    await injectAsOther({
      method: 'POST',
      url: '/api/transactions/import',
      headers: { 'content-type': 'text/csv' },
      payload:
        'data;tipo;descricao;categoria;valor;recorrente\r\n2026-08-09;despesa;Importada;geral;10,00;não\r\n',
    })

    const owner = await inject({ method: 'GET', url: '/api/transactions?month=2026-08' })
    expect(owner.json().items.map((t: { description: string }) => t.description)).toEqual([
      'Só do Lucas',
    ])
  })

  it('recusa com 401 toda rota de transação sem token válido', async () => {
    const routes: InjectOptions[] = [
      { method: 'GET', url: '/api/transactions' },
      { method: 'POST', url: '/api/transactions', payload: validPayload() },
      { method: 'PUT', url: '/api/transactions/1', payload: validPayload() },
      { method: 'DELETE', url: '/api/transactions/1' },
      { method: 'GET', url: '/api/transactions/export.csv?month=2026-08' },
      { method: 'GET', url: '/api/categories' },
      { method: 'GET', url: '/api/expenses-by-category' },
      { method: 'GET', url: '/api/daily-balance?month=2026-08' },
      { method: 'GET', url: '/api/summary' },
    ]

    for (const route of routes) {
      const response = await app.inject(route)
      expect(response.statusCode, `${route.method} ${route.url}`).toBe(401)
      expect(response.json()).toEqual({ error: 'unauthorized' })
    }
  })
})
