import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp, type BuildAppOptions } from '../src/app.js'

let app: FastifyInstance

async function build(options: Partial<BuildAppOptions> = {}) {
  app = await buildApp({ dbPath: ':memory:', ...options })
  await app.ready()
  return app
}

afterEach(async () => {
  await app.close()
})

async function health() {
  return app.inject({ method: 'GET', url: '/health' })
}

async function login() {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'lucas@example.com', password: 'senha-forte-123' },
  })
}

describe('cabeçalhos de segurança (helmet)', () => {
  it('manda nosniff, anti-clickjacking e HSTS em toda resposta', async () => {
    await build()
    const response = await health()

    expect(response.statusCode).toBe(200)
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(response.headers['strict-transport-security']).toContain('max-age=')
    expect(response.headers).not.toHaveProperty('x-powered-by')
  })

  it('libera o recurso para outra origem, senão o SPA não consumiria a API', async () => {
    await build()
    const response = await health()

    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin')
  })

  it('protege também a resposta de erro', async () => {
    await build()
    const response = await app.inject({ method: 'GET', url: '/api/auth/me' })

    expect(response.statusCode).toBe(401)
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })
})

describe('rate limit', () => {
  it('corta o IP que passa do teto global e informa quando tentar de novo', async () => {
    await build({ rateLimit: { max: 2, authMax: 10, timeWindow: 60_000 } })

    expect((await health()).statusCode).toBe(200)
    expect((await health()).statusCode).toBe(200)

    const blocked = await health()
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json()).toEqual({ error: 'rate_limit_exceeded' })
    expect(blocked.headers['retry-after']).toBeDefined()
    expect(Number(blocked.headers['x-ratelimit-limit'])).toBe(2)
    expect(Number(blocked.headers['x-ratelimit-remaining'])).toBe(0)
  })

  it('aplica um teto mais apertado no login sem derrubar o resto da API', async () => {
    await build({ rateLimit: { max: 50, authMax: 2, timeWindow: 60_000 } })

    expect((await login()).statusCode).toBe(401)
    expect((await login()).statusCode).toBe(401)

    const blocked = await login()
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json()).toEqual({ error: 'rate_limit_exceeded' })

    // O teto do login é só dele: as outras rotas continuam dentro do teto global.
    expect((await health()).statusCode).toBe(200)
  })

  it('aplica o teto de credenciais no registro também, em contagem própria', async () => {
    await build({ rateLimit: { max: 50, authMax: 1, timeWindow: 60_000 } })

    const register = async (email: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email, password: 'senha-forte-123' },
      })

    expect((await register('lucas@example.com')).statusCode).toBe(201)
    expect((await register('maria@example.com')).statusCode).toBe(429)

    // Cada rota tem o próprio balde: estourar o registro não consome o do login.
    expect((await login()).statusCode).toBe(200)
  })

  it('pode ser desligado por configuração', async () => {
    await build({ rateLimit: false })

    for (let i = 0; i < 5; i += 1) {
      expect((await health()).statusCode).toBe(200)
    }
    expect((await login()).statusCode).toBe(401)
  })
})
