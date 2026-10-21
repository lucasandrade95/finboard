import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { computeEtag, matchesIfNoneMatch } from '../src/http/etag.js'

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

async function inject(options: InjectOptions, as = auth) {
  return app.inject({ ...options, headers: { authorization: as, ...options.headers } })
}

async function addExpense(amountCents: number, as = auth) {
  return inject(
    {
      method: 'POST',
      url: '/api/transactions',
      payload: {
        type: 'expense',
        description: 'mercado',
        amountCents,
        category: 'mercado',
        occurredOn: '2026-10-05',
      },
    },
    as,
  )
}

const SUMMARY = '/api/summary?month=2026-10'

describe('ETag nos endpoints de leitura', () => {
  it('manda ETag, revalidação obrigatória e Vary por token na leitura JSON', async () => {
    const response = await inject({ method: 'GET', url: SUMMARY })

    expect(response.statusCode).toBe(200)
    expect(response.headers.etag).toBe(computeEtag(response.body))
    expect(response.headers['cache-control']).toBe('private, no-cache')
    expect(String(response.headers.vary)).toContain('Authorization')
  })

  it('responde 304 sem corpo quando a etiqueta do cliente ainda vale', async () => {
    const first = await inject({ method: 'GET', url: SUMMARY })
    const etag = String(first.headers.etag)

    const second = await inject({
      method: 'GET',
      url: SUMMARY,
      headers: { 'if-none-match': etag },
    })

    expect(second.statusCode).toBe(304)
    expect(second.body).toBe('')
    expect(second.headers.etag).toBe(etag)
    expect(second.headers).not.toHaveProperty('content-type')
  })

  it('volta a 200 com etiqueta nova quando os dados mudam', async () => {
    const before = await inject({ method: 'GET', url: SUMMARY })
    await addExpense(4590)

    const after = await inject({
      method: 'GET',
      url: SUMMARY,
      headers: { 'if-none-match': String(before.headers.etag) },
    })

    expect(after.statusCode).toBe(200)
    expect(after.headers.etag).not.toBe(before.headers.etag)
    expect(after.json().expenseCents).toBe(4590)
  })

  it('aceita lista, etiqueta fraca e curinga no If-None-Match', async () => {
    const first = await inject({ method: 'GET', url: '/api/transactions?month=2026-10' })
    const etag = String(first.headers.etag)

    for (const header of [`"outra", ${etag}`, `W/${etag}`, '*']) {
      const response = await inject({
        method: 'GET',
        url: '/api/transactions?month=2026-10',
        headers: { 'if-none-match': header },
      })
      expect(response.statusCode, header).toBe(304)
    }
  })

  it('não confunde contas: a etiqueta de uma não vale para os dados da outra', async () => {
    await addExpense(12000)
    const mine = await inject({ method: 'GET', url: SUMMARY })

    const other = await registerAndAuthorize(OTHER)
    const theirs = await inject(
      { method: 'GET', url: SUMMARY, headers: { 'if-none-match': String(mine.headers.etag) } },
      other,
    )

    expect(theirs.statusCode).toBe(200)
    expect(theirs.json().expenseCents).toBe(0)
  })

  it('fica fora de escrita, erro e rotas que já pedem no-store', async () => {
    const created = await addExpense(1000)
    expect(created.headers).not.toHaveProperty('etag')

    const unauthorized = await app.inject({ method: 'GET', url: SUMMARY })
    expect(unauthorized.statusCode).toBe(401)
    expect(unauthorized.headers).not.toHaveProperty('etag')

    const exported = await inject({ method: 'GET', url: '/api/auth/me/export' })
    expect(exported.statusCode).toBe(200)
    expect(exported.headers['cache-control']).toBe('private, no-store')
    expect(exported.headers).not.toHaveProperty('etag')

    const csv = await inject({ method: 'GET', url: '/api/transactions/export.csv?month=2026-10' })
    expect(csv.statusCode).toBe(200)
    expect(csv.headers).not.toHaveProperty('etag')
  })

  it('mantém o Vary do CORS ao acrescentar Authorization', async () => {
    const response = await inject({
      method: 'GET',
      url: SUMMARY,
      headers: { origin: 'http://localhost:5173' },
    })

    const vary = String(response.headers.vary)
    expect(vary).toContain('Origin')
    expect(vary).toContain('Authorization')
  })
})

describe('matchesIfNoneMatch', () => {
  it('compara sem diferenciar forte de fraca e recusa etiqueta diferente', () => {
    expect(matchesIfNoneMatch('"abc"', '"abc"')).toBe(true)
    expect(matchesIfNoneMatch('W/"abc"', '"abc"')).toBe(true)
    expect(matchesIfNoneMatch(' "x" ,  "abc" ', '"abc"')).toBe(true)
    expect(matchesIfNoneMatch('"abd"', '"abc"')).toBe(false)
    expect(matchesIfNoneMatch('', '"abc"')).toBe(false)
  })
})
