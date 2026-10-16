import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { diffTransactions, type AuditedSnapshot } from '../src/modules/transactions/audit.js'

const OWNER = { email: 'lucas@example.com', password: 'senha-forte-123' }
const OTHER = { email: 'maria@example.com', password: 'outra-senha-456' }

const PHARMACY = {
  type: 'expense',
  description: 'Farmácia',
  amountCents: 4590,
  category: 'saúde',
  occurredOn: '2026-10-14',
}

const SNAPSHOT: AuditedSnapshot = {
  type: 'expense',
  description: 'Farmácia',
  amountCents: 4590,
  category: 'saúde',
  occurredOn: '2026-10-14',
  recurring: false,
  accountId: null,
  tags: [],
}

let app: FastifyInstance
let ownerAuth: string

async function registerAndAuthorize(credentials: typeof OWNER): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: credentials,
  })
  return `Bearer ${response.json().token}`
}

async function inject(options: InjectOptions, auth = ownerAuth) {
  return app.inject({ ...options, headers: { authorization: auth, ...options.headers } })
}

async function createTransaction(payload: Record<string, unknown> = PHARMACY): Promise<number> {
  const response = await inject({ method: 'POST', url: '/api/transactions', payload })
  expect(response.statusCode).toBe(201)
  return response.json().id as number
}

function history(id: number, auth = ownerAuth) {
  return inject({ method: 'GET', url: `/api/transactions/${id}/history` }, auth)
}

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:', rateLimit: false })
  await app.ready()
  ownerAuth = await registerAndAuthorize(OWNER)
})

afterEach(async () => {
  await app.close()
})

describe('diffTransactions', () => {
  it('lista só os campos que mudaram, com o valor de antes e o de depois', () => {
    expect(
      diffTransactions(SNAPSHOT, { ...SNAPSHOT, amountCents: 5290, tags: ['remédio'] }),
    ).toEqual([
      { field: 'amountCents', from: 4590, to: 5290 },
      { field: 'tags', from: null, to: ['remédio'] },
    ])
  })

  it('na criação parte de null e ignora campos vazios (sem conta, sem tags)', () => {
    const changes = diffTransactions(undefined, SNAPSHOT)
    expect(changes.map((change) => change.field)).toEqual([
      'type',
      'description',
      'amountCents',
      'category',
      'occurredOn',
      'recurring',
    ])
    expect(changes.every((change) => change.from === null)).toBe(true)
  })

  it('estados iguais não geram mudança', () => {
    expect(diffTransactions(SNAPSHOT, { ...SNAPSHOT, tags: [] })).toEqual([])
  })
})

describe('GET /api/transactions/:id/history', () => {
  it('registra a criação com o autor e um horário UTC em ISO', async () => {
    const id = await createTransaction()

    const response = await history(id)

    expect(response.statusCode).toBe(200)
    const [entry, ...rest] = response.json().items
    expect(rest).toEqual([])
    expect(entry).toMatchObject({
      transactionId: id,
      action: 'created',
      actor: { email: OWNER.email },
    })
    expect(entry.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    expect(entry.changes).toContainEqual({ field: 'amountCents', from: null, to: 4590 })
  })

  it('a edição guarda só o que mudou, e o mais recente vem primeiro', async () => {
    const id = await createTransaction()
    await inject({
      method: 'PUT',
      url: `/api/transactions/${id}`,
      payload: { ...PHARMACY, amountCents: 5290, tags: ['remédio'] },
    })

    const items = (await history(id)).json().items

    expect(items.map((item: { action: string }) => item.action)).toEqual(['updated', 'created'])
    expect(items[0].changes).toEqual([
      { field: 'amountCents', from: 4590, to: 5290 },
      { field: 'tags', from: null, to: ['remédio'] },
    ])
  })

  it('salvar sem alterar nada não cria registro', async () => {
    const id = await createTransaction()
    await inject({ method: 'PUT', url: `/api/transactions/${id}`, payload: PHARMACY })

    expect((await history(id)).json().items).toHaveLength(1)
  })

  it('o histórico continua disponível depois da exclusão, com o último estado', async () => {
    const id = await createTransaction()
    const removed = await inject({ method: 'DELETE', url: `/api/transactions/${id}` })
    expect(removed.statusCode).toBe(204)

    const response = await history(id)

    expect(response.statusCode).toBe(200)
    const [deleted] = response.json().items
    expect(deleted.action).toBe('deleted')
    expect(deleted.changes).toContainEqual({ field: 'description', from: 'Farmácia', to: null })
  })

  it('edição recusada (payload inválido) não aparece no histórico', async () => {
    const id = await createTransaction()
    const rejected = await inject({
      method: 'PUT',
      url: `/api/transactions/${id}`,
      payload: { ...PHARMACY, amountCents: -1 },
    })
    expect(rejected.statusCode).toBe(400)

    expect((await history(id)).json().items).toHaveLength(1)
  })

  it('cobre também as transações importadas por CSV', async () => {
    const imported = await inject({
      method: 'POST',
      url: '/api/transactions/import',
      headers: { 'content-type': 'text/csv' },
      payload:
        'data;tipo;descricao;categoria;valor;recorrente\n' +
        '2026-10-10;despesa;Padaria;mercado;12,50;não\n',
    })
    expect(imported.statusCode).toBe(201)
    const list = await inject({ method: 'GET', url: '/api/transactions' })
    const [{ id }] = list.json().items

    expect((await history(id)).json().items[0].action).toBe('created')
  })

  it('não mostra o histórico de outra conta (404, sem confirmar que existe)', async () => {
    const id = await createTransaction()
    const otherAuth = await registerAndAuthorize(OTHER)

    const response = await history(id, otherAuth)

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'not_found' })
  })

  it('id sem histórico é 404 e id inválido é 400', async () => {
    expect((await history(999)).statusCode).toBe(404)
    const invalid = await inject({ method: 'GET', url: '/api/transactions/abc/history' })
    expect(invalid.statusCode).toBe(400)
  })

  it('exige autenticação', async () => {
    const id = await createTransaction()
    const response = await app.inject({ method: 'GET', url: `/api/transactions/${id}/history` })
    expect(response.statusCode).toBe(401)
  })
})
