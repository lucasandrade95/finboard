import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

const OWNER = { email: 'lucas@example.com', password: 'senha-forte-123' }
const OTHER = { email: 'maria@example.com', password: 'outra-senha-456' }

let app: FastifyInstance
let auth: string

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
async function inject(options: InjectOptions, as = auth) {
  return app.inject({ ...options, headers: { authorization: as, ...options.headers } })
}

async function accountIdOf(name: string, openingBalanceCents = 0, as = auth): Promise<number> {
  const response = await inject(
    { method: 'POST', url: '/api/accounts', payload: { name, openingBalanceCents } },
    as,
  )
  expect(response.statusCode).toBe(201)
  return response.json().id as number
}

async function createTransfer(payload: Record<string, unknown>, as = auth) {
  return inject(
    {
      method: 'POST',
      url: '/api/transfers',
      payload: { amountCents: 50000, occurredOn: '2026-09-10', ...payload },
    },
    as,
  )
}

async function balanceOf(id: number): Promise<number> {
  const response = await inject({ method: 'GET', url: '/api/accounts' })
  const account = (response.json().items as Array<{ id: number; balanceCents: number }>).find(
    (item) => item.id === id,
  )
  return account?.balanceCents ?? Number.NaN
}

describe('POST /api/transfers', () => {
  it('move o valor da origem para o destino e devolve a transferência', async () => {
    const checking = await accountIdOf('Corrente', 200000)
    const savings = await accountIdOf('Poupança', 10000)

    const response = await createTransfer({ fromAccountId: checking, toAccountId: savings })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      fromAccountId: checking,
      toAccountId: savings,
      amountCents: 50000,
      occurredOn: '2026-09-10',
      description: 'Transferência',
    })
    expect(await balanceOf(checking)).toBe(150000)
    expect(await balanceOf(savings)).toBe(60000)
  })

  it('grava um par de lançamentos vinculados, um em cada conta', async () => {
    const checking = await accountIdOf('Corrente')
    const savings = await accountIdOf('Poupança')
    const transfer = await createTransfer({
      fromAccountId: checking,
      toAccountId: savings,
      description: '  Reserva  ',
    })
    const transferId = transfer.json().id as number

    const list = await inject({ method: 'GET', url: '/api/transactions?month=2026-09' })
    const items = list.json().items as Array<Record<string, unknown>>

    expect(items).toHaveLength(2)
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'expense',
          accountId: checking,
          transferId,
          description: 'Reserva',
          category: 'transferência',
          amountCents: 50000,
        }),
        expect.objectContaining({ type: 'income', accountId: savings, transferId }),
      ]),
    )
  })

  it('fica fora de receita, despesa, gastos por categoria, série diária e orçamento', async () => {
    const checking = await accountIdOf('Corrente')
    const savings = await accountIdOf('Poupança')
    await inject({
      method: 'POST',
      url: '/api/transactions',
      payload: {
        type: 'expense',
        description: 'Mercado',
        amountCents: 12000,
        category: 'mercado',
        occurredOn: '2026-09-10',
        accountId: checking,
      },
    })
    await inject({
      method: 'PUT',
      url: `/api/budgets/${encodeURIComponent('transferência')}`,
      payload: { amountCents: 1000 },
    })
    await createTransfer({ fromAccountId: checking, toAccountId: savings })

    const summary = await inject({ method: 'GET', url: '/api/summary?month=2026-09' })
    expect(summary.json()).toMatchObject({ incomeCents: 0, expenseCents: 12000 })
    expect(summary.json().accounts).toEqual([
      { id: checking, name: 'Corrente', balanceCents: -62000 },
      { id: savings, name: 'Poupança', balanceCents: 50000 },
    ])

    const overall = await inject({ method: 'GET', url: '/api/summary' })
    expect(overall.json()).toMatchObject({ incomeCents: 0, expenseCents: 12000 })

    const byCategory = await inject({
      method: 'GET',
      url: '/api/expenses-by-category?month=2026-09',
    })
    expect(byCategory.json()).toEqual({
      items: [{ category: 'mercado', totalCents: 12000 }],
      totalCents: 12000,
    })

    const daily = await inject({ method: 'GET', url: '/api/daily-balance?month=2026-09' })
    const day = (daily.json().items as Array<{ date: string }>).find(
      (point) => point.date === '2026-09-10',
    )
    expect(day).toMatchObject({ incomeCents: 0, expenseCents: 12000 })

    const budgets = await inject({ method: 'GET', url: '/api/budgets?month=2026-09' })
    expect(budgets.json().items).toEqual([
      { category: 'transferência', budgetCents: 1000, spentCents: 0 },
    ])
  })

  it('recusa origem igual ao destino, valor não positivo e data mal formatada', async () => {
    const checking = await accountIdOf('Corrente')
    const savings = await accountIdOf('Poupança')

    const same = await createTransfer({ fromAccountId: checking, toAccountId: checking })
    expect(same.statusCode).toBe(400)
    expect(same.json().issues).toEqual([expect.objectContaining({ path: 'toAccountId' })])

    const zero = await createTransfer({
      fromAccountId: checking,
      toAccountId: savings,
      amountCents: 0,
    })
    expect(zero.statusCode).toBe(400)

    const badDate = await createTransfer({
      fromAccountId: checking,
      toAccountId: savings,
      occurredOn: '10/09/2026',
    })
    expect(badDate.statusCode).toBe(400)

    const list = await inject({ method: 'GET', url: '/api/transactions' })
    expect(list.json().total).toBe(0)
  })

  it('recusa conta inexistente ou de outro usuário sem gravar nada', async () => {
    const checking = await accountIdOf('Corrente')
    const other = await registerAndAuthorize(OTHER)
    const foreign = await accountIdOf('Conta da Maria', 0, other)

    const response = await createTransfer({ fromAccountId: checking, toAccountId: foreign })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: 'validation_error',
      issues: [{ path: 'toAccountId', message: 'conta não encontrada' }],
    })

    const missing = await createTransfer({ fromAccountId: 999, toAccountId: checking })
    expect(missing.json().issues).toEqual([
      { path: 'fromAccountId', message: 'conta não encontrada' },
    ])

    const list = await inject({ method: 'GET', url: '/api/transfers' })
    expect(list.json()).toEqual({ items: [] })
  })
})

describe('GET /api/transfers', () => {
  it('lista as do usuário, mais recentes primeiro, com recorte por mês', async () => {
    const checking = await accountIdOf('Corrente')
    const savings = await accountIdOf('Poupança')
    await createTransfer({
      fromAccountId: checking,
      toAccountId: savings,
      occurredOn: '2026-08-30',
    })
    await createTransfer({
      fromAccountId: savings,
      toAccountId: checking,
      occurredOn: '2026-09-02',
    })
    await createTransfer({
      fromAccountId: checking,
      toAccountId: savings,
      occurredOn: '2026-09-20',
    })

    const other = await registerAndAuthorize(OTHER)
    const a = await accountIdOf('A', 0, other)
    const b = await accountIdOf('B', 0, other)
    await createTransfer({ fromAccountId: a, toAccountId: b }, other)

    const all = await inject({ method: 'GET', url: '/api/transfers' })
    expect(all.json().items.map((item: { occurredOn: string }) => item.occurredOn)).toEqual([
      '2026-09-20',
      '2026-09-02',
      '2026-08-30',
    ])

    const september = await inject({ method: 'GET', url: '/api/transfers?month=2026-09' })
    expect(september.json().items).toHaveLength(2)
    expect(september.json().items[1]).toMatchObject({
      fromAccountId: savings,
      toAccountId: checking,
    })

    const invalid = await inject({ method: 'GET', url: '/api/transfers?month=2026-9' })
    expect(invalid.statusCode).toBe(400)
  })

  it('mantém a transferência quando uma das contas é excluída', async () => {
    const checking = await accountIdOf('Corrente', 100000)
    const savings = await accountIdOf('Poupança')
    await createTransfer({ fromAccountId: checking, toAccountId: savings })

    await inject({ method: 'DELETE', url: `/api/accounts/${savings}` })

    const list = await inject({ method: 'GET', url: '/api/transfers' })
    expect(list.json().items).toEqual([
      expect.objectContaining({ fromAccountId: checking, toAccountId: null }),
    ])
    expect(await balanceOf(checking)).toBe(50000)
  })
})

describe('DELETE /api/transfers/:id', () => {
  it('remove as duas pernas juntas e devolve os saldos ao que eram', async () => {
    const checking = await accountIdOf('Corrente', 100000)
    const savings = await accountIdOf('Poupança')
    const transfer = await createTransfer({ fromAccountId: checking, toAccountId: savings })

    const response = await inject({
      method: 'DELETE',
      url: `/api/transfers/${transfer.json().id}`,
    })
    expect(response.statusCode).toBe(204)
    expect(await balanceOf(checking)).toBe(100000)
    expect(await balanceOf(savings)).toBe(0)

    const list = await inject({ method: 'GET', url: '/api/transactions' })
    expect(list.json().total).toBe(0)

    const again = await inject({ method: 'DELETE', url: `/api/transfers/${transfer.json().id}` })
    expect(again.statusCode).toBe(404)
  })

  it('não remove transferência de outro usuário', async () => {
    const other = await registerAndAuthorize(OTHER)
    const a = await accountIdOf('A', 0, other)
    const b = await accountIdOf('B', 0, other)
    const transfer = await createTransfer({ fromAccountId: a, toAccountId: b }, other)

    const response = await inject({
      method: 'DELETE',
      url: `/api/transfers/${transfer.json().id}`,
    })
    expect(response.statusCode).toBe(404)

    const theirs = await inject({ method: 'GET', url: '/api/transfers' }, other)
    expect(theirs.json().items).toHaveLength(1)
  })
})

describe('perna de transferência nas rotas de transação', () => {
  it('não pode ser editada nem excluída sozinha (409)', async () => {
    const checking = await accountIdOf('Corrente')
    const savings = await accountIdOf('Poupança')
    await createTransfer({ fromAccountId: checking, toAccountId: savings })
    const list = await inject({ method: 'GET', url: '/api/transactions' })
    const leg = list.json().items[0] as { id: number }

    const update = await inject({
      method: 'PUT',
      url: `/api/transactions/${leg.id}`,
      payload: {
        type: 'expense',
        description: 'Editado',
        amountCents: 1,
        occurredOn: '2026-09-10',
      },
    })
    expect(update.statusCode).toBe(409)
    expect(update.json()).toEqual({ error: 'transfer_leg' })

    const remove = await inject({ method: 'DELETE', url: `/api/transactions/${leg.id}` })
    expect(remove.statusCode).toBe(409)

    const after = await inject({ method: 'GET', url: '/api/transactions' })
    expect(after.json().total).toBe(2)
    expect(await balanceOf(savings)).toBe(50000)
  })
})
