import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

const OWNER = { email: 'lucas@example.com', password: 'senha-forte-123' }
const OTHER = { email: 'maria@example.com', password: 'outra-senha-456' }

let app: FastifyInstance
let auth: string

/** Cria a conta e devolve o header pronto: toda rota de meta exige token. */
async function registerAndAuthorize(credentials = OWNER): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: credentials,
  })
  return `Bearer ${response.json().token}`
}

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' })
  await app.ready()
  auth = await registerAndAuthorize()
})

afterEach(async () => {
  await app.close()
})

/** `app.inject` já autenticado como o dono padrão dos testes. */
async function inject(options: InjectOptions) {
  return app.inject({ ...options, headers: { authorization: auth, ...options.headers } })
}

async function createGoal(payload: Record<string, unknown>, as = auth) {
  return app.inject({
    method: 'POST',
    url: '/api/goals',
    headers: { authorization: as },
    payload,
  })
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

    const response = await inject({ method: 'GET', url: '/api/goals' })
    expect(response.statusCode).toBe(200)
    const names = response.json().items.map((goal: { name: string }) => goal.name)
    expect(names).toEqual(['Outubro', 'Dezembro', 'Sem prazo'])
  })

  it('devolve lista vazia sem metas', async () => {
    const response = await inject({ method: 'GET', url: '/api/goals' })
    expect(response.json()).toEqual({ items: [] })
  })
})

describe('PUT /api/goals/:id', () => {
  it('substitui os campos da meta', async () => {
    const created = await createGoal({ name: 'Viagem', targetCents: 500000 })
    const { id } = created.json()

    const response = await inject({
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
    const response = await inject({
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

    const first = await inject({
      method: 'POST',
      url: `/api/goals/${id}/contributions`,
      payload: { amountCents: 25000 },
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().savedCents).toBe(125000)

    const second = await inject({
      method: 'POST',
      url: `/api/goals/${id}/contributions`,
      payload: { amountCents: 25000 },
    })
    expect(second.json().savedCents).toBe(150000)
  })

  it('rejeita aporte não positivo e meta inexistente', async () => {
    const created = await createGoal({ name: 'Viagem', targetCents: 500000 })
    const { id } = created.json()

    const invalid = await inject({
      method: 'POST',
      url: `/api/goals/${id}/contributions`,
      payload: { amountCents: 0 },
    })
    expect(invalid.statusCode).toBe(400)

    const missing = await inject({
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

    const response = await inject({ method: 'DELETE', url: `/api/goals/${id}` })
    expect(response.statusCode).toBe(204)

    const list = await inject({ method: 'GET', url: '/api/goals' })
    expect(list.json().items).toEqual([])
  })

  it('devolve 404 para meta inexistente e 400 para id inválido', async () => {
    const missing = await inject({ method: 'DELETE', url: '/api/goals/999' })
    expect(missing.statusCode).toBe(404)

    const invalid = await inject({ method: 'DELETE', url: '/api/goals/abc' })
    expect(invalid.statusCode).toBe(400)
  })
})

describe('escopo por usuário', () => {
  let otherAuth: string

  beforeEach(async () => {
    otherAuth = await registerAndAuthorize(OTHER)
  })

  function injectAsOther(options: InjectOptions) {
    return app.inject({ ...options, headers: { authorization: otherAuth, ...options.headers } })
  }

  it('responde 401 sem token em todas as rotas', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/goals' })
    const create = await app.inject({
      method: 'POST',
      url: '/api/goals',
      payload: { name: 'x', targetCents: 100 },
    })
    const update = await app.inject({
      method: 'PUT',
      url: '/api/goals/1',
      payload: { name: 'x', targetCents: 100 },
    })
    const contribute = await app.inject({
      method: 'POST',
      url: '/api/goals/1/contributions',
      payload: { amountCents: 100 },
    })
    const remove = await app.inject({ method: 'DELETE', url: '/api/goals/1' })

    expect([
      list.statusCode,
      create.statusCode,
      update.statusCode,
      contribute.statusCode,
      remove.statusCode,
    ]).toEqual([401, 401, 401, 401, 401])
  })

  it('cada conta só enxerga as próprias metas', async () => {
    await createGoal({ name: 'Reserva do Lucas', targetCents: 100000 })
    await createGoal({ name: 'Reserva da Maria', targetCents: 200000 }, otherAuth)

    const owner = await inject({ method: 'GET', url: '/api/goals' })
    const other = await injectAsOther({ method: 'GET', url: '/api/goals' })

    expect(owner.json().items.map((goal: { name: string }) => goal.name)).toEqual([
      'Reserva do Lucas',
    ])
    expect(other.json().items.map((goal: { name: string }) => goal.name)).toEqual([
      'Reserva da Maria',
    ])
  })

  it('não permite editar, aportar nem excluir meta de outra conta', async () => {
    const created = await createGoal({ name: 'Viagem', targetCents: 500000 })
    const { id } = created.json()

    const update = await injectAsOther({
      method: 'PUT',
      url: `/api/goals/${id}`,
      payload: { name: 'sequestrada', targetCents: 1 },
    })
    const contribute = await injectAsOther({
      method: 'POST',
      url: `/api/goals/${id}/contributions`,
      payload: { amountCents: 5000 },
    })
    const remove = await injectAsOther({ method: 'DELETE', url: `/api/goals/${id}` })

    // 404 e não 403: o id de outra conta não existe do ponto de vista de quem pergunta.
    expect([update.statusCode, contribute.statusCode, remove.statusCode]).toEqual([404, 404, 404])

    const still = await inject({ method: 'GET', url: '/api/goals' })
    expect(still.json().items[0]).toMatchObject({ id, name: 'Viagem', savedCents: 0 })
  })
})
