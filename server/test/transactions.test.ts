import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
    expect(body.total).toBe(2)
    expect(body.limit).toBe(20)
    expect(body.offset).toBe(0)
    expect(body.items.map((t: { description: string }) => t.description)).toEqual([
      'agosto tarde',
      'agosto cedo',
    ])
  })

  it('rejeita mês mal formatado', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/transactions?month=agosto' })
    expect(response.statusCode).toBe(400)
  })

  it('pagina com limit/offset mantendo o total do filtro', async () => {
    for (let day = 1; day <= 5; day += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: validPayload({
          description: `compra ${day}`,
          occurredOn: `2026-08-0${day}`,
        }),
      })
    }

    const response = await app.inject({
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
    await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload() })

    const response = await app.inject({
      method: 'GET',
      url: '/api/transactions?month=2026-08&limit=10&offset=50',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ items: [], total: 1 })
  })

  it('rejeita limit fora do intervalo 1..100', async () => {
    for (const limit of ['0', '101', 'abc']) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/transactions?limit=${limit}`,
      })
      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('validation_error')
    }
  })

  it('rejeita offset negativo', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/transactions?offset=-1' })
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
      await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await app.inject({
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
    await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload() })

    const response = await app.inject({ method: 'GET', url: '/api/transactions?category=viagem' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ items: [], total: 0 })
  })

  it('rejeita categoria vazia', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/transactions?category=' })
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
      await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await app.inject({
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
      await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await app.inject({
      method: 'GET',
      url: `/api/transactions?type=expense&category=${encodeURIComponent('alimentação')}`,
    })
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.total).toBe(1)
    expect(body.items[0].description).toBe('feira')
  })

  it('rejeita tipo desconhecido', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/transactions?type=investimento' })
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
      await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await app.inject({ method: 'GET', url: '/api/transactions?q=MERCADO' })
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
      await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await app.inject({
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
      await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const percent = await app.inject({ method: 'GET', url: '/api/transactions?q=50%25' })
    expect(percent.statusCode).toBe(200)
    expect(percent.json().items.map((t: { description: string }) => t.description)).toEqual([
      'desconto 50%',
    ])

    const underscore = await app.inject({ method: 'GET', url: '/api/transactions?q=a_b' })
    expect(underscore.statusCode).toBe(200)
    expect(underscore.json().items.map((t: { description: string }) => t.description)).toEqual([
      'plano a_b',
    ])
  })

  it('devolve lista vazia quando a busca não casa com nada', async () => {
    await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload() })

    const response = await app.inject({ method: 'GET', url: '/api/transactions?q=viagem' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ items: [], total: 0 })
  })

  it('rejeita busca vazia', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/transactions?q=' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('validation_error')
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
      recurring: false,
      createdAt,
    })

    const summary = await app.inject({ method: 'GET', url: '/api/summary?month=2026-08' })
    expect(summary.json()).toEqual({
      incomeCents: 500000,
      expenseCents: 0,
      balanceCents: 500000,
      previous: { month: '2026-07', incomeCents: 0, expenseCents: 0, balanceCents: 0 },
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
    expect(list.json().items[0].amountCents).toBe(15990)
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
    expect(list.json()).toMatchObject({ items: [], total: 0 })
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

describe('GET /api/categories', () => {
  it('devolve categorias distintas em ordem alfabética pt-BR', async () => {
    const entries = [
      { category: 'transporte' },
      { category: 'alimentação' },
      { category: 'alimentação' },
      { category: 'água' },
    ]
    for (const entry of entries) {
      await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await app.inject({ method: 'GET', url: '/api/categories' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ categories: ['água', 'alimentação', 'transporte'] })
  })

  it('restringe as categorias ao mês informado', async () => {
    const entries = [
      { category: 'alimentação', occurredOn: '2026-08-02' },
      { category: 'transporte', occurredOn: '2026-07-15' },
    ]
    for (const entry of entries) {
      await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await app.inject({ method: 'GET', url: '/api/categories?month=2026-08' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ categories: ['alimentação'] })
  })

  it('devolve lista vazia quando não há transações', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/categories' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ categories: [] })
  })

  it('rejeita mês mal formatado', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/categories?month=agosto' })
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
      await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await app.inject({ method: 'GET', url: '/api/expenses-by-category' })
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
      await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await app.inject({ method: 'GET', url: '/api/expenses-by-category' })
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
      await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await app.inject({
      method: 'GET',
      url: '/api/expenses-by-category?month=2026-08',
    })
    expect(response.json()).toEqual({
      items: [{ category: 'alimentação', totalCents: 10000 }],
      totalCents: 10000,
    })
  })

  it('devolve total zero quando só há receitas', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ type: 'income' }),
    })

    const response = await app.inject({ method: 'GET', url: '/api/expenses-by-category' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ items: [], totalCents: 0 })
  })

  it('rejeita mês mal formatado', async () => {
    const response = await app.inject({
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
      previous: { month: '2026-07', incomeCents: 999900, expenseCents: 0, balanceCents: 999900 },
    })
  })

  it('compara janeiro com dezembro do ano anterior', async () => {
    const entries = [
      { type: 'income', amountCents: 100000, occurredOn: '2026-01-10' },
      { type: 'expense', amountCents: 40000, occurredOn: '2025-12-20' },
    ]
    for (const entry of entries) {
      await app.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: validPayload(entry),
      })
    }

    const response = await app.inject({ method: 'GET', url: '/api/summary?month=2026-01' })
    expect(response.json()).toEqual({
      incomeCents: 100000,
      expenseCents: 0,
      balanceCents: 100000,
      previous: { month: '2025-12', incomeCents: 0, expenseCents: 40000, balanceCents: -40000 },
    })
  })

  it('sem mês devolve o resumo geral sem comparativo', async () => {
    await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload() })

    const response = await app.inject({ method: 'GET', url: '/api/summary' })
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
      await app.inject({ method: 'POST', url: '/api/transactions', payload: validPayload(entry) })
    }

    const response = await app.inject({ method: 'GET', url: '/api/daily-balance?month=2026-08' })
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
    const response = await app.inject({ method: 'GET', url: '/api/daily-balance?month=2024-02' })
    expect(response.statusCode).toBe(200)
    const { items } = response.json()
    expect(items).toHaveLength(29)
    expect(items[28].date).toBe('2024-02-29')
    expect(items.every((item: { balanceCents: number }) => item.balanceCents === 0)).toBe(true)
  })

  it('exige o mês e rejeita formato inválido', async () => {
    const semMes = await app.inject({ method: 'GET', url: '/api/daily-balance' })
    expect(semMes.statusCode).toBe(400)
    expect(semMes.json().error).toBe('validation_error')

    const invalido = await app.inject({ method: 'GET', url: '/api/daily-balance?month=2026-8' })
    expect(invalido.statusCode).toBe(400)
  })
})

describe('transações recorrentes', () => {
  // Geração acontece no boot: precisa de banco em arquivo para sobreviver ao close/reopen.
  let dir: string
  let dbPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finboard-test-'))
    dbPath = join(dir, 'test.db')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function bootApp(recurringMonth: string): Promise<FastifyInstance> {
    const instance = await buildApp({ dbPath, recurringMonth })
    await instance.ready()
    return instance
  }

  it('cria transação com a flag e devolve recurring no registro', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ recurring: true }),
    })
    expect(response.statusCode).toBe(201)
    expect(response.json().recurring).toBe(true)

    const semFlag = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload(),
    })
    expect(semFlag.json().recurring).toBe(false)
  })

  it('gera cópia no boot para o mês seguinte, só das recorrentes', async () => {
    const first = await bootApp('2026-08')
    await first.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ description: 'Aluguel', occurredOn: '2026-08-05', recurring: true }),
    })
    await first.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ description: 'Mercado', occurredOn: '2026-08-10' }),
    })
    await first.close()

    const second = await bootApp('2026-09')
    const response = await second.inject({
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
    await first.inject({
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
    const response = await check.inject({ method: 'GET', url: '/api/transactions?month=2026-09' })
    await check.close()
    expect(response.json().total).toBe(1)
  })

  it('usa a ocorrência mais recente da série como modelo (edição vale dali em diante)', async () => {
    const first = await bootApp('2026-08')
    for (const [amountCents, occurredOn] of [
      [100000, '2026-07-05'],
      [120000, '2026-08-05'],
    ] as const) {
      await first.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: validPayload({ description: 'Aluguel', amountCents, occurredOn, recurring: true }),
      })
    }
    await first.close()

    const second = await bootApp('2026-09')
    const response = await second.inject({
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
    await first.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: validPayload({ description: 'Fatura', occurredOn: '2026-01-31', recurring: true }),
    })
    await first.close()

    const second = await bootApp('2026-02')
    const response = await second.inject({
      method: 'GET',
      url: '/api/transactions?month=2026-02',
    })
    await second.close()

    expect(response.json().items[0].occurredOn).toBe('2026-02-28')
  })

  it('gera mesmo com mês sem boot no meio (última ocorrência pode ser antiga)', async () => {
    const first = await bootApp('2026-07')
    await first.inject({
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
    const response = await second.inject({
      method: 'GET',
      url: '/api/transactions?month=2026-09',
    })
    await second.close()

    const body = response.json()
    expect(body.total).toBe(1)
    expect(body.items[0]).toMatchObject({ description: 'Assinatura', occurredOn: '2026-09-12' })
  })
})
