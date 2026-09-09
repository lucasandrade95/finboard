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

async function createGoal(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/goals', payload })
}

describe('POST /api/goals', () => {
  it('cria meta com valor guardado zero e sem prazo por padrão', async () => {
    const response = await createGoal({ name: 'Reserva de emergência', targetCents: 1000000 })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      name: 'Reserva de emergência',
      targetCents: 1000000,
      savedCents: 0,
      deadline: null,
    })
    expect(response.json().id).toBeTypeOf('number')
  })

  it('aceita prazo e valor inicial guardado', async () => {
    const response = await createGoal({
      name: 'Viagem',
      targetCents: 500000,
      savedCents: 120000,
      deadline: '2027-01-31',
    })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ savedCents: 120000, deadline: '2027-01-31' })
  })

  it('rejeita alvo não positivo, guardado negativo e prazo mal formatado', async () => {
    const badTarget = await createGoal({ name: 'x', targetCents: 0 })
    expect(badTarget.statusCode).toBe(400)
    expect(badTarget.json().error).toBe('validation_error')

    const badSaved = await createGoal({ name: 'x', targetCents: 100, savedCents: -1 })
    expect(badSaved.statusCode).toBe(400)

    const badDeadline = await createGoal({ name: 'x', targetCents: 100, deadline: '31/01/2027' })
    expect(badDeadline.statusCode).toBe(400)
  })
})

describe('GET /api/goals', () => {
  it('lista por prazo mais próximo, metas sem prazo por último', async () => {
    await createGoal({ name: 'Sem prazo', targetCents: 100 })
    await createGoal({ name: 'Dezembro', targetCents: 100, deadline: '2026-12-31' })
    await createGoal({ name: 'Outubro', targetCents: 100, deadline: '2026-10-15' })

    const response = await app.inject({ method: 'GET', url: '/api/goals' })
    expect(response.statusCode).toBe(200)
    const names = response.json().items.map((goal: { name: string }) => goal.name)
    expect(names).toEqual(['Outubro', 'Dezembro', 'Sem prazo'])
  })

  it('devolve lista vazia sem metas', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/goals' })
    expect(response.json()).toEqual({ items: [] })
  })
})

describe('PUT /api/goals/:id', () => {
  it('substitui os campos da meta', async () => {
    const created = await createGoal({ name: 'Viagem', targetCents: 500000 })
    const { id } = created.json()

    const response = await app.inject({
      method: 'PUT',
      url: `/api/goals/${id}`,
      payload: { name: 'Viagem Europa', targetCents: 800000, savedCents: 50000, deadline: null },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      id,
      name: 'Viagem Europa',
      targetCents: 800000,
      savedCents: 50000,
      deadline: null,
    })
  })

  it('devolve 404 para meta inexistente', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/goals/999',
      payload: { name: 'x', targetCents: 100 },
    })
    expect(response.statusCode).toBe(404)
  })
})

describe('POST /api/goals/:id/contributions', () => {
  it('soma o aporte ao valor guardado', async () => {
    const created = await createGoal({ name: 'Viagem', targetCents: 500000, savedCents: 100000 })
    const { id } = created.json()

    const first = await app.inject({
      method: 'POST',
      url: `/api/goals/${id}/contributions`,
      payload: { amountCents: 25000 },
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().savedCents).toBe(125000)

    const second = await app.inject({
      method: 'POST',
      url: `/api/goals/${id}/contributions`,
      payload: { amountCents: 25000 },
    })
    expect(second.json().savedCents).toBe(150000)
  })

  it('rejeita aporte não positivo e meta inexistente', async () => {
    const created = await createGoal({ name: 'Viagem', targetCents: 500000 })
    const { id } = created.json()

    const invalid = await app.inject({
      method: 'POST',
      url: `/api/goals/${id}/contributions`,
      payload: { amountCents: 0 },
    })
    expect(invalid.statusCode).toBe(400)

    const missing = await app.inject({
      method: 'POST',
      url: '/api/goals/999/contributions',
      payload: { amountCents: 100 },
    })
    expect(missing.statusCode).toBe(404)
  })
})

describe('DELETE /api/goals/:id', () => {
  it('remove a meta e devolve 204', async () => {
    const created = await createGoal({ name: 'Viagem', targetCents: 500000 })
    const { id } = created.json()

    const response = await app.inject({ method: 'DELETE', url: `/api/goals/${id}` })
    expect(response.statusCode).toBe(204)

    const list = await app.inject({ method: 'GET', url: '/api/goals' })
    expect(list.json().items).toEqual([])
  })

  it('devolve 404 para meta inexistente e 400 para id inválido', async () => {
    const missing = await app.inject({ method: 'DELETE', url: '/api/goals/999' })
    expect(missing.statusCode).toBe(404)

    const invalid = await app.inject({ method: 'DELETE', url: '/api/goals/abc' })
    expect(invalid.statusCode).toBe(400)
  })
})
