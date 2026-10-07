import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { addMonths, splitInstallments } from '../src/modules/installments/repository.js'

const OWNER = { email: 'lucas@example.com', password: 'senha-forte-123' }
const OTHER = { email: 'maria@example.com', password: 'outra-senha-456' }

interface Parcel {
  id: number
  description: string
  amountCents: number
  occurredOn: string
  category: string
  accountId: number | null
  installmentId: number | null
  installmentNumber: number | null
  tags: string[]
}

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

async function createInstallment(payload: Record<string, unknown> = {}, as = auth) {
  return inject(
    {
      method: 'POST',
      url: '/api/installments',
      payload: {
        description: 'Notebook',
        totalCents: 10000,
        installmentCount: 3,
        firstDueOn: '2026-10-15',
        category: 'eletrônicos',
        ...payload,
      },
    },
    as,
  )
}

/** Parcelas do usuário em ordem de vencimento (a listagem vem da mais recente). */
async function parcels(as = auth): Promise<Parcel[]> {
  const response = await inject({ method: 'GET', url: '/api/transactions?limit=100' }, as)
  return (response.json().items as Parcel[])
    .filter((item) => item.installmentId !== null)
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))
}

describe('splitInstallments', () => {
  it('divide em centavos inteiros e põe a sobra na primeira parcela', () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333])
    expect(splitInstallments(9000, 3)).toEqual([3000, 3000, 3000])
    expect(splitInstallments(2, 2)).toEqual([1, 1])
  })

  it('sempre soma exatamente o total', () => {
    for (const [total, count] of [
      [123457, 7],
      [99999, 48],
      [50, 12],
    ] as const) {
      const parts = splitInstallments(total, count)
      expect(parts).toHaveLength(count)
      expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total)
    }
  })
})

describe('addMonths', () => {
  it('avança o mês mantendo o dia e vira o ano', () => {
    expect(addMonths('2026-10-15', 0)).toBe('2026-10-15')
    expect(addMonths('2026-10-15', 3)).toBe('2027-01-15')
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01')
  })

  it('limita o dia ao fim do mês sem perder o dia original nas parcelas seguintes', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonths('2026-01-31', 3)).toBe('2026-04-30')
  })
})

describe('POST /api/installments', () => {
  it('gera uma despesa por mês, numerada e vinculada, que soma o total', async () => {
    const response = await createInstallment({ tags: ['casa'] })

    expect(response.statusCode).toBe(201)
    const installment = response.json()
    expect(installment).toMatchObject({
      description: 'Notebook',
      totalCents: 10000,
      installmentCount: 3,
      category: 'eletrônicos',
      accountId: null,
      firstDueOn: '2026-10-15',
      lastDueOn: '2026-12-15',
    })

    const items = await parcels()
    expect(items).toHaveLength(3)
    expect(items.map((item) => [item.description, item.amountCents, item.occurredOn])).toEqual([
      ['Notebook (1/3)', 3334, '2026-10-15'],
      ['Notebook (2/3)', 3333, '2026-11-15'],
      ['Notebook (3/3)', 3333, '2026-12-15'],
    ])
    for (const [index, item] of items.entries()) {
      expect(item).toMatchObject({
        installmentId: installment.id,
        installmentNumber: index + 1,
        category: 'eletrônicos',
        tags: ['casa'],
      })
    }
  })

  it('conta cada parcela como despesa só no mês em que vence', async () => {
    await createInstallment()

    const october = await inject({ method: 'GET', url: '/api/summary?month=2026-10' })
    const january = await inject({ method: 'GET', url: '/api/summary?month=2027-01' })

    expect(october.json()).toMatchObject({ expenseCents: 3334, balanceCents: -3334 })
    expect(january.json()).toMatchObject({ expenseCents: 0 })
  })

  it('lança as parcelas na conta escolhida', async () => {
    const account = await inject({
      method: 'POST',
      url: '/api/accounts',
      payload: { name: 'Cartão', openingBalanceCents: 0 },
    })
    const accountId = account.json().id as number

    const response = await createInstallment({ accountId })

    expect(response.statusCode).toBe(201)
    expect(response.json().accountId).toBe(accountId)
    expect((await parcels()).every((item) => item.accountId === accountId)).toBe(true)
  })

  it('recusa conta de outro usuário sem gravar parcela nenhuma', async () => {
    const other = await registerAndAuthorize(OTHER)
    const foreign = await inject(
      { method: 'POST', url: '/api/accounts', payload: { name: 'Dela', openingBalanceCents: 0 } },
      other,
    )

    const response = await createInstallment({ accountId: foreign.json().id })

    expect(response.statusCode).toBe(400)
    expect(response.json().issues).toEqual([{ path: 'accountId', message: 'conta não encontrada' }])
    expect(await parcels()).toEqual([])
  })

  it.each([
    ['uma parcela só', { installmentCount: 1 }, 'installmentCount'],
    ['mais de 48 parcelas', { installmentCount: 49 }, 'installmentCount'],
    ['total menor que 1 centavo por parcela', { totalCents: 2, installmentCount: 3 }, 'totalCents'],
    ['valor em reais com casas decimais', { totalCents: 99.9 }, 'totalCents'],
    ['data fora do formato', { firstDueOn: '15/10/2026' }, 'firstDueOn'],
  ])('recusa %s com 400 no campo', async (_label, payload, path) => {
    const response = await createInstallment(payload)

    expect(response.statusCode).toBe(400)
    expect(response.json().issues.map((issue: { path: string }) => issue.path)).toContain(path)
    expect(await parcels()).toEqual([])
  })
})

describe('GET /api/installments', () => {
  it('lista só os parcelamentos do usuário, do mais recente para o mais antigo', async () => {
    await createInstallment({ description: 'Geladeira', firstDueOn: '2026-08-10' })
    await createInstallment({ description: 'Notebook', firstDueOn: '2026-10-15' })
    const other = await registerAndAuthorize(OTHER)
    await createInstallment({ description: 'Sofá' }, other)

    const response = await inject({ method: 'GET', url: '/api/installments' })

    expect(response.statusCode).toBe(200)
    expect(
      (response.json().items as Array<{ description: string }>).map((item) => item.description),
    ).toEqual(['Notebook', 'Geladeira'])
  })
})

describe('DELETE /api/installments/:id', () => {
  it('cancela a compra removendo todas as parcelas juntas', async () => {
    const created = await createInstallment()

    const response = await inject({
      method: 'DELETE',
      url: `/api/installments/${created.json().id}`,
    })

    expect(response.statusCode).toBe(204)
    expect(await parcels()).toEqual([])
    const list = await inject({ method: 'GET', url: '/api/installments' })
    expect(list.json().items).toEqual([])
  })

  it('responde 404 para parcelamento de outro usuário e não apaga nada', async () => {
    const other = await registerAndAuthorize(OTHER)
    const foreign = await createInstallment({}, other)

    const response = await inject({
      method: 'DELETE',
      url: `/api/installments/${foreign.json().id}`,
    })

    expect(response.statusCode).toBe(404)
    expect(await parcels(other)).toHaveLength(3)
  })
})

describe('parcela avulsa nas rotas de transação', () => {
  it('não pode ser excluída nem editada sozinha (409 installment_part)', async () => {
    await createInstallment()
    const [first] = await parcels()
    if (!first) throw new Error('parcela não criada')

    const removed = await inject({ method: 'DELETE', url: `/api/transactions/${first.id}` })
    const updated = await inject({
      method: 'PUT',
      url: `/api/transactions/${first.id}`,
      payload: {
        type: 'expense',
        description: 'Outra coisa',
        amountCents: 1,
        occurredOn: '2026-10-15',
      },
    })

    expect(removed.statusCode).toBe(409)
    expect(removed.json()).toEqual({ error: 'installment_part' })
    expect(updated.statusCode).toBe(409)
    expect((await parcels()).map((item) => item.amountCents)).toEqual([3334, 3333, 3333])
  })
})
