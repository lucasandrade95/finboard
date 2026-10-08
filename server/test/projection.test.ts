import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { addDays, nextRecurringDates } from '../src/modules/projection/repository.js'

const OWNER = { email: 'lucas@example.com', password: 'senha-forte-123' }
const OTHER = { email: 'maria@example.com', password: 'outra-senha-456' }

// "Hoje" fixo nos testes: a janela padrão de 30 dias vai de 09/10 a 07/11.
const TODAY = '2026-10-08'

interface ProjectionEvent {
  date: string
  type: 'income' | 'expense'
  description: string
  amountCents: number
  source: 'scheduled' | 'installment' | 'recurring'
}

interface ProjectionPoint {
  date: string
  netCents: number
  balanceCents: number
}

interface Projection {
  from: string
  to: string
  startingBalanceCents: number
  endingBalanceCents: number
  lowestBalanceCents: number
  lowestBalanceOn: string
  events: ProjectionEvent[]
  items: ProjectionPoint[]
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

async function inject(options: InjectOptions, as = auth) {
  return app.inject({ ...options, headers: { authorization: as, ...options.headers } })
}

async function createTransaction(payload: Record<string, unknown>, as = auth) {
  const response = await inject(
    {
      method: 'POST',
      url: '/api/transactions',
      payload: { type: 'expense', category: 'geral', ...payload },
    },
    as,
  )
  expect(response.statusCode).toBe(201)
}

async function projection(query = `from=${TODAY}`, as = auth): Promise<Projection> {
  const response = await inject({ method: 'GET', url: `/api/projection?${query}` }, as)
  expect(response.statusCode).toBe(200)
  return response.json() as Projection
}

function pointOn(result: Projection, date: string): ProjectionPoint | undefined {
  return result.items.find((item) => item.date === date)
}

describe('addDays', () => {
  it('vira mês e ano sem fuso', () => {
    expect(addDays('2026-10-08', 30)).toBe('2026-11-07')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('nextRecurringDates', () => {
  it('avança mês a mês a partir da última ocorrência e só devolve datas depois de hoje', () => {
    expect(nextRecurringDates('2026-09-05', '2026-10-08', '2026-11-07')).toEqual(['2026-11-05'])
    expect(nextRecurringDates('2026-09-20', '2026-10-08', '2026-11-07')).toEqual(['2026-10-20'])
  })

  it('limita o dia ao fim do mês e segue do dia limitado, como a geração do boot', () => {
    expect(nextRecurringDates('2027-01-31', '2027-01-31', '2027-04-30')).toEqual([
      '2027-02-28',
      '2027-03-28',
      '2027-04-28',
    ])
  })

  it('não projeta nada quando a próxima ocorrência passa do horizonte', () => {
    expect(nextRecurringDates('2026-10-20', '2026-10-08', '2026-11-07')).toEqual([])
  })
})

describe('GET /api/projection', () => {
  it('sem lançamentos devolve saldo zero e um ponto por dia do horizonte', async () => {
    const result = await projection()

    expect(result).toMatchObject({
      from: TODAY,
      to: '2026-11-07',
      startingBalanceCents: 0,
      endingBalanceCents: 0,
      lowestBalanceCents: 0,
      lowestBalanceOn: TODAY,
      events: [],
    })
    expect(result.items).toHaveLength(30)
    expect(result.items[0]?.date).toBe('2026-10-09')
    expect(result.items.at(-1)?.date).toBe('2026-11-07')
  })

  it('parte do saldo até hoje (inclusive) e soma os lançamentos futuros no dia em que caem', async () => {
    await createTransaction({
      type: 'income',
      description: 'Salário',
      amountCents: 500000,
      occurredOn: '2026-10-01',
    })
    await createTransaction({ description: 'Mercado', amountCents: 30000, occurredOn: TODAY })
    await createTransaction({ description: 'IPVA', amountCents: 120000, occurredOn: '2026-10-15' })
    // Fora do horizonte de 30 dias: não entra.
    await createTransaction({ description: 'Seguro', amountCents: 90000, occurredOn: '2026-11-20' })

    const result = await projection()

    expect(result.startingBalanceCents).toBe(470000)
    expect(result.events).toEqual([
      {
        date: '2026-10-15',
        type: 'expense',
        description: 'IPVA',
        category: 'geral',
        amountCents: 120000,
        source: 'scheduled',
      },
    ])
    expect(pointOn(result, '2026-10-14')?.balanceCents).toBe(470000)
    expect(pointOn(result, '2026-10-15')).toMatchObject({ netCents: -120000, balanceCents: 350000 })
    expect(result.endingBalanceCents).toBe(350000)
  })

  it('soma o saldo inicial das contas ao saldo de hoje', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/accounts',
      payload: { name: 'Corrente', openingBalanceCents: 100000 },
    })
    expect(response.statusCode).toBe(201)
    await createTransaction({
      description: 'Farmácia',
      amountCents: 5000,
      occurredOn: '2026-10-02',
    })

    expect((await projection()).startingBalanceCents).toBe(95000)
  })

  it('inclui as parcelas que vencem no horizonte, marcadas como parcela', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/installments',
      payload: {
        description: 'Notebook',
        totalCents: 300000,
        installmentCount: 3,
        firstDueOn: '2026-09-25',
      },
    })
    expect(response.statusCode).toBe(201)

    const result = await projection()

    // 1/3 já venceu (está no saldo); 2/3 cai no horizonte; 3/3 fica para dezembro.
    expect(result.startingBalanceCents).toBe(-100000)
    expect(result.events).toMatchObject([
      {
        date: '2026-10-25',
        description: 'Notebook (2/3)',
        amountCents: 100000,
        source: 'installment',
      },
    ])
    expect(result.endingBalanceCents).toBe(-200000)
  })

  it('projeta as próximas cópias das recorrentes ainda não geradas, com o valor mais recente', async () => {
    await createTransaction({
      type: 'income',
      description: 'Salário',
      amountCents: 450000,
      occurredOn: '2026-08-05',
      recurring: true,
    })
    // Reajuste no último lançamento da série: é esse valor que vale para frente.
    await createTransaction({
      type: 'income',
      description: 'Salário',
      amountCents: 500000,
      occurredOn: '2026-09-05',
      recurring: true,
    })
    await createTransaction({
      description: 'Aluguel',
      amountCents: 200000,
      occurredOn: '2026-09-20',
      recurring: true,
    })

    const result = await projection()

    // A cópia de outubro do salário (dia 05) já passou; a de novembro entra.
    expect(result.events).toEqual([
      expect.objectContaining({ date: '2026-10-20', description: 'Aluguel', source: 'recurring' }),
      expect.objectContaining({
        date: '2026-11-05',
        description: 'Salário',
        amountCents: 500000,
        source: 'recurring',
      }),
    ])
  })

  it('não duplica a recorrente que já foi gravada no mês', async () => {
    await createTransaction({
      description: 'Aluguel',
      amountCents: 200000,
      occurredOn: '2026-09-20',
      recurring: true,
    })
    await createTransaction({
      description: 'Aluguel',
      amountCents: 200000,
      occurredOn: '2026-10-20',
      recurring: true,
    })

    const result = await projection()

    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({ date: '2026-10-20', source: 'recurring' })
  })

  it('aponta o dia em que o saldo previsto fica mais baixo', async () => {
    await createTransaction({
      type: 'income',
      description: 'Freela',
      amountCents: 100000,
      occurredOn: '2026-10-01',
    })
    await createTransaction({
      description: 'Cartão',
      amountCents: 150000,
      occurredOn: '2026-10-12',
    })
    await createTransaction({
      type: 'income',
      description: 'Salário',
      amountCents: 500000,
      occurredOn: '2026-10-30',
    })

    const result = await projection()

    expect(result.lowestBalanceCents).toBe(-50000)
    expect(result.lowestBalanceOn).toBe('2026-10-12')
    expect(result.endingBalanceCents).toBe(450000)
  })

  it('ignora transferências entre contas', async () => {
    const ids: number[] = []
    for (const name of ['Corrente', 'Poupança']) {
      const response = await inject({ method: 'POST', url: '/api/accounts', payload: { name } })
      ids.push(response.json().id as number)
    }
    const response = await inject({
      method: 'POST',
      url: '/api/transfers',
      payload: {
        fromAccountId: ids[0],
        toAccountId: ids[1],
        amountCents: 50000,
        occurredOn: '2026-10-20',
      },
    })
    expect(response.statusCode).toBe(201)

    const result = await projection()

    expect(result.events).toEqual([])
    expect(result.endingBalanceCents).toBe(0)
  })

  it('respeita o horizonte pedido em `days`', async () => {
    await createTransaction({ description: 'IPVA', amountCents: 120000, occurredOn: '2026-10-15' })

    const result = await projection(`from=${TODAY}&days=7`)

    expect(result.to).toBe('2026-10-15')
    expect(result.items).toHaveLength(7)
    expect(result.events).toHaveLength(1)
  })

  it('sem `from` usa a data de hoje', async () => {
    const result = await projection('')

    expect(result.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.items).toHaveLength(30)
  })

  it('só enxerga os lançamentos do próprio usuário', async () => {
    const other = await registerAndAuthorize(OTHER)
    await createTransaction(
      { description: 'IPVA', amountCents: 120000, occurredOn: '2026-10-15' },
      other,
    )
    await createTransaction(
      { type: 'income', description: 'Salário', amountCents: 9000, occurredOn: '2026-10-01' },
      other,
    )

    const result = await projection()

    expect(result.startingBalanceCents).toBe(0)
    expect(result.events).toEqual([])
  })

  it.each([
    ['days=0', 'days'],
    ['days=91', 'days'],
    ['days=abc', 'days'],
    ['from=08/10/2026', 'from'],
    ['from=2026-02-31', 'from'],
  ])('recusa %s com 400', async (query, field) => {
    const response = await inject({ method: 'GET', url: `/api/projection?${query}` })

    expect(response.statusCode).toBe(400)
    expect(response.json().issues[0].path).toBe(field)
  })

  it('exige token', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/projection' })

    expect(response.statusCode).toBe(401)
  })
})
