import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

let app: FastifyInstance

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:', rateLimit: false })
  await app.ready()
})

afterEach(async () => {
  await app.close()
})

interface OperationDoc {
  summary?: string
  tags?: string[]
  security?: Array<Record<string, string[]>>
  requestBody?: unknown
  responses: Record<string, unknown>
}

interface OpenApiDoc {
  openapi: string
  info: { title: string; version: string }
  components: { securitySchemes: Record<string, { type: string; scheme: string }> }
  paths: Record<string, Record<string, OperationDoc>>
}

async function fetchDocument(): Promise<OpenApiDoc> {
  const response = await app.inject({ method: 'GET', url: '/docs/json' })
  expect(response.statusCode).toBe(200)
  return response.json() as OpenApiDoc
}

async function register() {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: 'lucas@example.com', password: 'senha-forte-123' },
  })
  return response.json().token as string
}

describe('documento OpenAPI', () => {
  it('descreve a API com título, versão e o esquema de token', async () => {
    const doc = await fetchDocument()

    expect(doc.openapi).toMatch(/^3\./)
    expect(doc.info.title).toBe('Finboard API')
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    })
  })

  it('cobre todas as rotas publicadas no README', async () => {
    const doc = await fetchDocument()

    for (const path of [
      '/health',
      '/api/auth/register',
      '/api/auth/login',
      '/api/auth/me',
      '/api/transactions',
      '/api/transactions/{id}',
      '/api/transactions/export.csv',
      '/api/transactions/import',
      '/api/categories',
      '/api/daily-balance',
      '/api/summary',
      '/api/expenses-by-category',
      '/api/budgets',
      '/api/budgets/{category}',
      '/api/goals',
      '/api/goals/{id}',
      '/api/goals/{id}/contributions',
    ]) {
      expect(doc.paths[path], `rota ${path} fora da documentação`).toBeDefined()
    }
  })

  it('marca como protegida toda rota que exige token, e só elas', async () => {
    const doc = await fetchDocument()
    const isPublic = (operation: OperationDoc) => operation.security === undefined

    expect(isPublic(doc.paths['/health'].get)).toBe(true)
    expect(isPublic(doc.paths['/api/auth/register'].post)).toBe(true)
    expect(isPublic(doc.paths['/api/auth/login'].post)).toBe(true)

    expect(doc.paths['/api/auth/me'].get.security).toEqual([{ bearerAuth: [] }])
    expect(doc.paths['/api/transactions'].post.security).toEqual([{ bearerAuth: [] }])
    expect(doc.paths['/api/goals'].get.security).toEqual([{ bearerAuth: [] }])
    expect(doc.paths['/api/budgets'].get.security).toEqual([{ bearerAuth: [] }])
  })

  it('documenta corpo, resumo e respostas de erro das rotas de escrita', async () => {
    const doc = await fetchDocument()
    const create = doc.paths['/api/transactions'].post

    expect(create.summary).toBe('Cria transação')
    expect(create.tags).toEqual(['transações'])
    expect(create.requestBody).toBeDefined()
    expect(Object.keys(create.responses).sort()).toEqual(['201', '400', '401'])
  })

  it('serve a UI de exploração sem exigir token', async () => {
    const page = await app.inject({ method: 'GET', url: '/docs' })

    expect(page.statusCode).toBe(200)
    expect(page.headers['content-type']).toContain('text/html')
    // A CSP do helmet barraria o script embutido da UI; o plugin manda a própria.
    expect(page.headers['content-security-policy']).toContain("script-src 'self'")
  })
})

describe('schema das rotas é só documentação', () => {
  it('não filtra campos da resposta', async () => {
    const token = await register()
    const response = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        type: 'expense',
        description: 'Mercado do mês',
        amountCents: 32990,
        category: 'mercado',
        occurredOn: '2026-09-18',
      },
    })

    expect(response.statusCode).toBe(201)
    // `createdAt` e `recurring` só aparecem se a serialização não tiver recortado nada.
    expect(Object.keys(response.json()).sort()).toEqual([
      'amountCents',
      'category',
      'createdAt',
      'description',
      'id',
      'occurredOn',
      'recurring',
      'type',
    ])
  })

  it('deixa o Zod recusar o corpo inválido, com erro por campo', async () => {
    const token = await register()
    const response = await app.inject({
      method: 'POST',
      url: '/api/transactions',
      headers: { authorization: `Bearer ${token}` },
      payload: { type: 'expense', description: '', amountCents: -1, occurredOn: '18/09/2026' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('validation_error')
    expect(response.json().issues.map((issue: { path: string }) => issue.path)).toContain(
      'amountCents',
    )
  })

  it('não transforma o CSV do export em JSON', async () => {
    const token = await register()
    const response = await app.inject({
      method: 'GET',
      url: '/api/transactions/export.csv?month=2026-09',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.body.startsWith('﻿')).toBe(true)
  })
})
