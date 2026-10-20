import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { buildBudgetAlertEmail } from '../src/mail/budget-alert-email.js'
import type { MailMessage, Mailer } from '../src/mail/mailer.js'

const OWNER = { email: 'lucas@example.com', password: 'senha-forte-123' }
const OTHER = { email: 'maria@example.com', password: 'outra-senha-456' }

let app: FastifyInstance
let outbox: MailMessage[]
let failSend: boolean
let auth: string

const memoryMailer: Mailer = {
  send(message) {
    if (failSend) return Promise.reject(new Error('provedor fora do ar'))
    outbox.push(message)
    return Promise.resolve()
  },
}

async function registerAndAuthorize(credentials = OWNER): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: credentials,
  })
  return `Bearer ${response.json().token}`
}

beforeEach(async () => {
  outbox = []
  failSend = false
  app = await buildApp({
    dbPath: ':memory:',
    rateLimit: false,
    mailer: memoryMailer,
    appUrl: 'https://finboard.example/',
  })
  await app.ready()
  auth = await registerAndAuthorize()
})

afterEach(async () => {
  await app.close()
})

async function setBudget(category: string, amountCents: number, as = auth) {
  return app.inject({
    method: 'PUT',
    url: `/api/budgets/${encodeURIComponent(category)}`,
    headers: { authorization: as },
    payload: { amountCents },
  })
}

async function addTransaction(
  fields: {
    type?: 'income' | 'expense'
    amountCents: number
    category: string
    occurredOn?: string
  },
  as = auth,
) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/transactions',
    headers: { authorization: as },
    payload: { type: 'expense', description: 'gasto', occurredOn: '2026-10-05', ...fields },
  })
  expect(response.statusCode).toBe(201)
  return response.json() as { id: number }
}

describe('alerta de orçamento por e-mail', () => {
  it('avisa uma vez ao chegar a 80% e outra ao chegar a 100%', async () => {
    await setBudget('mercado', 100000)

    await addTransaction({ amountCents: 70000, category: 'mercado' })
    expect(outbox).toHaveLength(0)

    await addTransaction({ amountCents: 10000, category: 'mercado' })
    expect(outbox).toHaveLength(1)
    expect(outbox[0]?.to).toBe(OWNER.email)
    expect(outbox[0]?.subject).toBe('Finboard: orçamento de mercado em 80%')
    expect(outbox[0]?.text).toContain(
      'Você já usou 80% do orçamento de mercado em outubro de 2026.',
    )
    expect(outbox[0]?.text).toContain('Gasto até agora: R$ 800,00 de R$ 1.000,00 (80%).')
    expect(outbox[0]?.text).toContain('Ainda restam R$ 200,00 para o mês.')
    expect(outbox[0]?.text).toContain('https://finboard.example/')

    // Mais gasto entre 80% e 100% não repete o aviso.
    await addTransaction({ amountCents: 5000, category: 'mercado' })
    expect(outbox).toHaveLength(1)

    await addTransaction({ amountCents: 25000, category: 'mercado' })
    expect(outbox).toHaveLength(2)
    expect(outbox[1]?.subject).toBe('Finboard: orçamento de mercado estourado')
    expect(outbox[1]?.text).toContain('O excedente é de R$ 100,00.')

    await addTransaction({ amountCents: 1000, category: 'mercado' })
    expect(outbox).toHaveLength(2)
  })

  it('manda só o aviso de 100% quando um lançamento pula os dois limiares', async () => {
    await setBudget('lazer', 20000)

    await addTransaction({ amountCents: 30000, category: 'lazer' })

    expect(outbox.map((message) => message.subject)).toEqual([
      'Finboard: orçamento de lazer estourado',
    ])
    // O 80% ficou gravado junto: baixar o gasto e subir de novo não manda o aviso atrasado.
    const exported = await app.inject({
      method: 'GET',
      url: '/api/auth/me/export',
      headers: { authorization: auth },
    })
    expect(
      (exported.json().budgetAlerts as Array<{ threshold: number }>).map((a) => a.threshold),
    ).toEqual([80, 100])
  })

  it('ignora receita e categoria sem orçamento', async () => {
    await setBudget('mercado', 10000)

    await addTransaction({ type: 'income', amountCents: 50000, category: 'mercado' })
    await addTransaction({ amountCents: 50000, category: 'aluguel' })

    expect(outbox).toHaveLength(0)
  })

  it('cada mês tem os próprios avisos', async () => {
    await setBudget('mercado', 10000)

    await addTransaction({ amountCents: 9000, category: 'mercado', occurredOn: '2026-09-30' })
    await addTransaction({ amountCents: 8000, category: 'mercado', occurredOn: '2026-10-01' })

    expect(outbox.map((message) => message.text.split('\n')[2])).toEqual([
      'Você já usou 90% do orçamento de mercado em setembro de 2026.',
      'Você já usou 80% do orçamento de mercado em outubro de 2026.',
    ])
  })

  it('avisa ao editar uma despesa que leva a categoria ao limite', async () => {
    await setBudget('mercado', 10000)
    const { id } = await addTransaction({ amountCents: 1000, category: 'mercado' })
    expect(outbox).toHaveLength(0)

    const response = await app.inject({
      method: 'PUT',
      url: `/api/transactions/${id}`,
      headers: { authorization: auth },
      payload: {
        type: 'expense',
        description: 'gasto',
        amountCents: 10000,
        category: 'mercado',
        occurredOn: '2026-10-05',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(outbox.map((message) => message.subject)).toEqual([
      'Finboard: orçamento de mercado estourado',
    ])
    expect(outbox[0]?.text).toContain('Não sobra mais nada do orçamento neste mês.')
  })

  it('avalia a importação de CSV por categoria, com um e-mail por limiar', async () => {
    await setBudget('mercado', 10000)
    const csv = [
      'data;tipo;descricao;categoria;valor;recorrente',
      '2026-10-01;despesa;Feira;mercado;40,00;não',
      '2026-10-02;despesa;Padaria;mercado;45,00;não',
    ].join('\n')

    const response = await app.inject({
      method: 'POST',
      url: '/api/transactions/import',
      headers: { authorization: auth, 'content-type': 'text/csv' },
      payload: csv,
    })

    expect(response.statusCode).toBe(201)
    expect(outbox.map((message) => message.subject)).toEqual([
      'Finboard: orçamento de mercado em 80%',
    ])
  })

  it('usa o orçamento e o gasto de cada conta, e avisa só o dono', async () => {
    const other = await registerAndAuthorize(OTHER)
    await setBudget('mercado', 10000)
    await setBudget('mercado', 100000, other)

    // A despesa da outra conta não conta no orçamento do dono, e vice-versa.
    await addTransaction({ amountCents: 9000, category: 'mercado' }, other)
    expect(outbox).toHaveLength(0)

    await addTransaction({ amountCents: 9000, category: 'mercado' })
    expect(outbox.map((message) => message.to)).toEqual([OWNER.email])
  })

  it('falha do provedor de e-mail não derruba o lançamento', async () => {
    await setBudget('mercado', 10000)
    failSend = true

    await addTransaction({ amountCents: 20000, category: 'mercado' })

    const list = await app.inject({
      method: 'GET',
      url: '/api/budgets?month=2026-10',
      headers: { authorization: auth },
    })
    expect(list.json().items).toEqual([
      { category: 'mercado', budgetCents: 10000, spentCents: 20000 },
    ])
  })

  it('exclusão da conta leva os avisos junto', async () => {
    await setBudget('mercado', 10000)
    await addTransaction({ amountCents: 20000, category: 'mercado' })

    const removed = await app.inject({
      method: 'DELETE',
      url: '/api/auth/me',
      headers: { authorization: auth },
      payload: { password: OWNER.password },
    })
    expect(removed.statusCode).toBe(204)

    // Mesmo e-mail registrado de novo começa do zero: o aviso de 100% sai outra vez.
    auth = await registerAndAuthorize()
    await setBudget('mercado', 10000)
    await addTransaction({ amountCents: 20000, category: 'mercado' })
    expect(outbox).toHaveLength(2)
  })
})

describe('buildBudgetAlertEmail', () => {
  it('escapa a categoria no HTML e tira quebra de linha do assunto', () => {
    const message = buildBudgetAlertEmail({
      to: 'lucas@example.com',
      appUrl: 'https://finboard.example',
      category: '<b>casa</b>\nBcc: x@y',
      month: '2026-10',
      threshold: 80,
      budgetCents: 10000,
      spentCents: 8999,
    })

    expect(message.subject).toBe('Finboard: orçamento de <b>casa</b> Bcc: x@y em 80%')
    expect(message.html).toContain('&lt;b&gt;casa&lt;/b&gt;')
    expect(message.html).not.toContain('<b>casa</b>')
    // 89,99% arredonda para baixo.
    expect(message.text).toContain('(89%)')
  })
})
